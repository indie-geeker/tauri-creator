#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    {{CARGO_CRATE_NAME}}_lib::run()
}
