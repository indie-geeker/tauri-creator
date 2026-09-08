use std::collections::BTreeSet;

pub trait ShortcutRegistry {
    fn can_coexist(&self) -> bool {
        true
    }
    fn normalize(&self, shortcut: &str) -> Result<String, String>;
    fn register(&mut self, shortcut: &str) -> Result<(), String>;
    fn unregister(&mut self, shortcut: &str) -> Result<(), String>;
}
#[derive(Default)]
pub struct ShortcutCoordinator {
    pub active: Option<String>,
    pub registered: BTreeSet<String>,
    pub degraded: bool,
    pub error: Option<String>,
}
impl ShortcutCoordinator {
    pub fn switch(
        &mut self,
        registry: &mut impl ShortcutRegistry,
        desired: &str,
        mut persist: impl FnMut() -> Result<(), String>,
    ) {
        self.error = None;
        let next = match registry.normalize(desired) {
            Ok(value) => value,
            Err(error) => {
                self.error = Some(error);
                return;
            }
        };
        if self.active.as_ref() == Some(&next) && !self.degraded {
            if let Err(error) = persist() {
                self.error = Some(format!("failed to persist shortcut: {error}"));
            }
            return;
        }
        if self.degraded {
            self.error = Some(
                "Shortcut registration is degraded; restart to reinitialize before switching"
                    .into(),
            );
            return;
        }
        let old = self.active.clone();
        let exclusive = !registry.can_coexist();
        if exclusive {
            if let Some(previous) = &old {
                if let Err(error) = registry.unregister(previous) {
                    self.error = Some(error);
                    return;
                }
                self.registered.remove(previous);
            }
        }
        if let Err(error) = registry.register(&next) {
            self.error = Some(error);
            if exclusive {
                self.restore_previous(registry, old.as_deref());
            }
            return;
        }
        self.registered.insert(next.clone());
        if let Some(previous) = old.as_ref().filter(|_| !exclusive) {
            if let Err(error) = registry.unregister(previous) {
                self.error = Some(format!("failed to unregister previous shortcut: {error}"));
                self.undo_registration(registry, &next);
                return;
            }
            self.registered.remove(previous);
        }
        if let Err(error) = persist() {
            self.error = Some(format!("failed to persist shortcut: {error}"));
            if exclusive {
                self.undo_registration(registry, &next);
            }
            self.restore_previous(registry, old.as_deref());
            if !exclusive {
                self.undo_registration(registry, &next);
            }
            return;
        }
        self.active = Some(next);
    }
    fn restore_previous(&mut self, registry: &mut impl ShortcutRegistry, previous: Option<&str>) {
        self.active = None;
        if let Some(previous) = previous {
            match registry.register(previous) {
                Ok(()) => {
                    self.registered.insert(previous.into());
                    self.active = Some(previous.into());
                }
                Err(error) => {
                    self.degraded = true;
                    self.error
                        .as_mut()
                        .unwrap()
                        .push_str(&format!("; failed to restore previous shortcut: {error}"));
                }
            }
        }
    }
    fn undo_registration(&mut self, registry: &mut impl ShortcutRegistry, shortcut: &str) {
        match registry.unregister(shortcut) {
            Ok(()) => {
                self.registered.remove(shortcut);
            }
            Err(error) => {
                self.degraded = true;
                self.error
                    .as_mut()
                    .unwrap()
                    .push_str(&format!("; failed to remove new shortcut: {error}"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct Registry {
        keys: BTreeSet<String>,
        fail: BTreeSet<String>,
        exclusive: bool,
    }
    impl ShortcutRegistry for Registry {
        fn can_coexist(&self) -> bool {
            !self.exclusive
        }
        fn normalize(&self, value: &str) -> Result<String, String> {
            if value == "invalid" {
                Err("invalid".into())
            } else {
                Ok(value.trim().into())
            }
        }
        fn register(&mut self, value: &str) -> Result<(), String> {
            if self.fail.contains(&format!("register:{value}"))
                || (self.exclusive && !self.keys.is_empty())
            {
                Err("conflict".into())
            } else {
                self.keys.insert(value.into());
                Ok(())
            }
        }
        fn unregister(&mut self, value: &str) -> Result<(), String> {
            if self.fail.contains(&format!("unregister:{value}")) {
                Err("unregister failed".into())
            } else {
                self.keys.remove(value);
                Ok(())
            }
        }
    }
    fn initial() -> (ShortcutCoordinator, Registry) {
        let mut c = ShortcutCoordinator::default();
        let mut r = Registry::default();
        c.switch(&mut r, "old", || Ok(()));
        (c, r)
    }
    #[test]
    fn invalid_or_conflicting_new_key_keeps_old() {
        for next in ["invalid", "new"] {
            let (mut c, mut r) = initial();
            r.fail.insert("register:new".into());
            c.switch(&mut r, next, || panic!("must not persist"));
            assert_eq!(c.active.as_deref(), Some("old"));
            assert_eq!(r.keys, BTreeSet::from(["old".into()]));
        }
    }
    #[test]
    fn unregister_failure_removes_tentative_new_key() {
        let (mut c, mut r) = initial();
        r.fail.insert("unregister:old".into());
        c.switch(&mut r, "new", || panic!("must not persist"));
        assert_eq!(r.keys, BTreeSet::from(["old".into()]));
        assert!(!c.degraded);
    }
    #[test]
    fn persistence_failure_restores_old_key() {
        let (mut c, mut r) = initial();
        c.switch(&mut r, "new", || Err("disk full".into()));
        assert_eq!(c.active.as_deref(), Some("old"));
        assert_eq!(r.keys, BTreeSet::from(["old".into()]));
        assert!(c.error.unwrap().contains("disk full"));
    }
    #[test]
    fn compensation_failure_reports_actual_registrations() {
        let (mut c, mut r) = initial();
        r.fail.insert("register:old".into());
        c.switch(&mut r, "new", || Err("disk full".into()));
        assert!(c.degraded);
        assert!(c.active.is_none());
        assert_eq!(c.registered, r.keys);
    }
    #[test]
    fn repeated_same_key_is_noop_and_sequential_switches_commit() {
        let (mut c, mut r) = initial();
        c.switch(&mut r, "old", || Ok(()));
        for key in ["second", "third"] {
            c.switch(&mut r, key, || Ok(()));
            assert_eq!(c.active.as_deref(), Some(key));
            assert_eq!(r.keys, BTreeSet::from([key.into()]));
        }
    }
    #[test]
    fn exclusive_registry_restores_old_after_new_registration_failure() {
        let (mut c, mut r) = initial();
        r.exclusive = true;
        r.fail.insert("register:new".into());
        c.switch(&mut r, "new", || panic!("must not persist"));
        assert_eq!(c.active.as_deref(), Some("old"));
        assert_eq!(r.keys, BTreeSet::from(["old".into()]));
        r.fail.clear();
        c.switch(&mut r, "new", || Err("disk full".into()));
        assert_eq!(c.active.as_deref(), Some("old"));
        assert_eq!(r.keys, BTreeSet::from(["old".into()]));
        c.switch(&mut r, "new", || Ok(()));
        assert_eq!(c.active.as_deref(), Some("new"));
    }
    #[test]
    fn same_effective_key_still_persists_reset_intent() {
        let (mut c, mut r) = initial();
        let mut persisted = false;
        c.switch(&mut r, "old", || {
            persisted = true;
            Ok(())
        });
        assert!(persisted);
        assert_eq!(r.keys, BTreeSet::from(["old".into()]));
    }
}
