use crate::system::{get_system_info, list_processes, is_port_available, SystemInfo, ProcessInfo};
use tauri::command;

#[command]
pub async fn system_info() -> SystemInfo {
    get_system_info()
}

#[command]
pub async fn system_processes() -> Vec<ProcessInfo> {
    list_processes()
}

#[command]
pub async fn check_port(port: u16) -> bool {
    is_port_available(port)
}
