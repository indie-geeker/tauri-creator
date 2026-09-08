use super::open_database;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{
    mpsc::{sync_channel, SyncSender, TrySendError},
    Mutex,
};
use std::thread::JoinHandle;
use tokio::sync::oneshot;

type Job = Box<dyn FnOnce(&mut Connection) + Send + 'static>;
pub const QUEUE_CAPACITY: usize = 64;

pub struct DatabaseWorker {
    sender: Mutex<Option<SyncSender<Job>>>,
    thread: Mutex<Option<JoinHandle<()>>>,
    pub path: PathBuf,
}

impl DatabaseWorker {
    /// Called only during synchronous application setup; all SQL runs on the worker.
    pub fn open(path: PathBuf, capacity: usize) -> Result<Self, String> {
        let (sender, receiver) = sync_channel::<Job>(capacity);
        let (ready, startup) = sync_channel(1);
        let worker_path = path.clone();
        let thread = std::thread::Builder::new()
            .name("sqlite-worker".into())
            .spawn(move || {
                let mut connection = match open_database(&worker_path) {
                    Ok(connection) => {
                        let _ = ready.send(Ok(()));
                        connection
                    }
                    Err(error) => {
                        let _ = ready.send(Err(error));
                        return;
                    }
                };
                while let Ok(job) = receiver.recv() {
                    job(&mut connection);
                }
            })
            .map_err(|e| format!("failed to start database worker: {e}"))?;
        if let Err(error) = startup
            .recv()
            .map_err(|_| "database worker failed during startup".to_string())
            .and_then(|result| result)
        {
            drop(sender);
            let _ = thread.join();
            return Err(error);
        }
        Ok(Self {
            sender: Mutex::new(Some(sender)),
            thread: Mutex::new(Some(thread)),
            path,
        })
    }

    fn enqueue<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
    ) -> Result<oneshot::Receiver<Result<T, String>>, String> {
        let (reply, response) = oneshot::channel();
        let sender = self
            .sender
            .lock()
            .map_err(|_| "database worker lock poisoned")?
            .as_ref()
            .cloned()
            .ok_or("database worker stopped")?;
        match sender.try_send(Box::new(move |connection| {
            let _ = reply.send(operation(connection));
        })) {
            Ok(()) => Ok(response),
            Err(TrySendError::Full(_)) => Err("database busy: request queue is full".into()),
            Err(TrySendError::Disconnected(_)) => Err("database worker stopped".into()),
        }
    }

    pub async fn request<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.enqueue(operation)?
            .await
            .map_err(|_| "database worker stopped before replying".to_string())?
    }

    /// Drains admitted jobs and joins. Call from synchronous Exit, never an async command.
    pub fn shutdown(&self) -> Result<(), String> {
        self.sender
            .lock()
            .map_err(|_| "database worker lock poisoned")?
            .take();
        if let Some(thread) = self
            .thread
            .lock()
            .map_err(|_| "database thread lock poisoned")?
            .take()
        {
            thread.join().map_err(|_| "database worker panicked")?;
        }
        Ok(())
    }
}

impl Drop for DatabaseWorker {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    #[test]
    fn slow_operation_keeps_callers_async_and_queue_is_bounded() {
        let worker = DatabaseWorker::open(PathBuf::from(":memory:"), 1).unwrap();
        let (started, wait_started) = channel();
        let (release, blocked) = channel();
        let first = worker
            .enqueue(move |_| {
                started.send(()).unwrap();
                blocked.recv().unwrap();
                Ok(1)
            })
            .unwrap();
        wait_started.recv().unwrap();
        let second = worker.enqueue(|_| Ok(2)).unwrap();
        assert!(worker
            .enqueue(|_| Ok(3))
            .unwrap_err()
            .contains("queue is full"));
        release.send(()).unwrap();
        assert_eq!(first.blocking_recv().unwrap().unwrap(), 1);
        assert_eq!(second.blocking_recv().unwrap().unwrap(), 2);
        worker.shutdown().unwrap();
        assert!(worker.enqueue(|_| Ok(4)).unwrap_err().contains("stopped"));
        worker.shutdown().unwrap();
    }
    #[test]
    fn shutdown_drains_admitted_jobs_before_joining() {
        let worker =
            std::sync::Arc::new(DatabaseWorker::open(PathBuf::from(":memory:"), 2).unwrap());
        let (started, waiting) = channel();
        let (release, blocked) = channel();
        let first = worker
            .enqueue(move |_| {
                started.send(()).unwrap();
                blocked.recv().unwrap();
                Ok(1)
            })
            .unwrap();
        waiting.recv().unwrap();
        let second = worker.enqueue(|_| Ok(2)).unwrap();
        let closing = worker.clone();
        let thread = std::thread::spawn(move || closing.shutdown().unwrap());
        release.send(()).unwrap();
        thread.join().unwrap();
        assert_eq!(first.blocking_recv().unwrap().unwrap(), 1);
        assert_eq!(second.blocking_recv().unwrap().unwrap(), 2);
        assert!(worker.enqueue(|_| Ok(3)).unwrap_err().contains("stopped"));
    }

    #[test]
    fn operation_error_does_not_poison_later_requests() {
        let worker = DatabaseWorker::open(PathBuf::from(":memory:"), 2).unwrap();
        let failed = worker
            .enqueue::<()>(|_| Err("fixture failure".into()))
            .unwrap();
        assert_eq!(
            failed.blocking_recv().unwrap().unwrap_err(),
            "fixture failure"
        );
        assert_eq!(
            worker
                .enqueue(|_| Ok(7))
                .unwrap()
                .blocking_recv()
                .unwrap()
                .unwrap(),
            7
        );
        worker.shutdown().unwrap();
    }
}
