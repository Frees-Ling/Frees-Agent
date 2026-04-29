use crate::shell::{execute_shell, validate_command, ShellExecOptions, ShellResult};
use tauri::command;

#[command]
pub async fn exec_shell(command: String, cwd: Option<String>, timeout_ms: Option<u64>) -> Result<ShellResult, String> {
    validate_command(&command)?;
    let options = ShellExecOptions {
        command,
        cwd,
        timeout_ms,
    };
    execute_shell(options).await
}

#[command]
pub async fn validate_shell_command(command: String) -> Result<bool, String> {
    validate_command(&command)?;
    Ok(true)
}
