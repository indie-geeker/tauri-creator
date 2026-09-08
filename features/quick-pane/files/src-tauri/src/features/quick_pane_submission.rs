use serde::Serialize;
use std::sync::Mutex;

pub const MAX_SUBMISSION_BYTES: usize = 32 * 1024;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct QuickPaneReceipt {
    pub sequence: String,
    pub text: String,
}
#[derive(Default)]
pub struct SubmissionStore(Mutex<(u64, Option<QuickPaneReceipt>)>);
impl SubmissionStore {
    pub fn accept(&self, text: &str) -> Result<QuickPaneReceipt, String> {
        let text = text.trim();
        if text.is_empty() || text.len() > MAX_SUBMISSION_BYTES {
            return Err(format!(
                "Enter between 1 and {MAX_SUBMISSION_BYTES} UTF-8 bytes"
            ));
        }
        let mut state = self.0.lock().map_err(|_| "submission store unavailable")?;
        state.0 = state
            .0
            .checked_add(1)
            .ok_or("submission sequence exhausted")?;
        let receipt = QuickPaneReceipt {
            sequence: state.0.to_string(),
            text: text.to_owned(),
        };
        state.1 = Some(receipt.clone());
        Ok(receipt)
    }
    pub fn latest(&self) -> Result<Option<QuickPaneReceipt>, String> {
        self.0
            .lock()
            .map(|state| state.1.clone())
            .map_err(|_| "submission store unavailable".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshots_are_process_local_trimmed_and_sequenced() {
        let store = SubmissionStore::default();
        assert!(store.latest().unwrap().is_none());
        assert_eq!(store.accept("  entry  ").unwrap().text, "entry");
        let receipt = store.accept("next").unwrap();
        assert_eq!(receipt.sequence, "2");
        assert_eq!(store.latest().unwrap(), Some(receipt));
        assert!(SubmissionStore::default().latest().unwrap().is_none());
    }
    #[test]
    fn invalid_text_does_not_replace_snapshot() {
        let store = SubmissionStore::default();
        let receipt = store.accept("entry").unwrap();
        assert!(store.accept(" ").is_err());
        assert!(store
            .accept(&"水".repeat(MAX_SUBMISSION_BYTES / 3 + 1))
            .is_err());
        assert_eq!(store.latest().unwrap(), Some(receipt));
    }
}
