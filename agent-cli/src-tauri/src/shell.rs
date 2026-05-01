use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Instant;

#[derive(Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub timed_out: bool,
}

#[derive(Serialize, Deserialize)]
pub struct ShellExecOptions {
    pub command: String,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
}

/// Execute a shell command on any platform.
/// Windows uses cmd.exe /c, Unix uses sh -c.
pub async fn execute_shell(options: ShellExecOptions) -> Result<ShellResult, String> {
    let start = Instant::now();
    let shell_cmd = if cfg!(target_os = "windows") {
        "cmd.exe"
    } else {
        "sh"
    };
    let shell_flag = if cfg!(target_os = "windows") {
        "/c"
    } else {
        "-c"
    };

    let mut cmd = Command::new(shell_cmd);
    cmd.arg(shell_flag).arg(&options.command);

    if let Some(ref cwd) = options.cwd {
        cmd.current_dir(cwd);
    }

    // Security: block dangerous commands (cross-platform safe)
    let lower = options.command.to_lowercase();
    let dangerous = [
        "rm -rf /", "rm -rf ~", "mkfs.", "dd if=", ":(){ :|:& };:",
        "sudo rm -rf", "chmod 777 /", "> /dev/sda", "> /dev/nvme",
        "mkfs.ext4", "mkfs.fat", "format ",
    ];
    for &pattern in &dangerous {
        if lower.contains(pattern) {
            return Err(format!("命令被安全策略拦截（危险模式）: {}", pattern));
        }
    }

    // Block curl/wget only when used in pipes (data exfiltration prevention)
    if lower.contains("| curl ") || lower.contains("| wget ") || lower.contains("| nc ") {
        return Err("命令被安全策略拦截：不允许在管道中使用 curl/wget/nc（防止数据泄露）".into());
    }

    let output = if let Some(timeout) = options.timeout_ms {
        // Run with timeout via tokio
        let handle = tokio::task::spawn_blocking(move || cmd.output());
        match tokio::time::timeout(
            std::time::Duration::from_millis(timeout),
            handle,
        )
        .await
        {
            Ok(Ok(Ok(output))) => output,
            Ok(Ok(Err(e))) => return Err(format!("命令执行失败: {}", e)),
            Ok(Err(_)) => return Err("命令任务被取消".into()),
            Err(_) => {
                return Ok(ShellResult {
                    stdout: String::new(),
                    stderr: String::new(),
                    exit_code: -1,
                    duration_ms: start.elapsed().as_millis() as u64,
                    timed_out: true,
                });
            }
        }
    } else {
        cmd.output().map_err(|e| format!("命令执行失败: {}", e))?
    };

    let elapsed = start.elapsed().as_millis() as u64;
    Ok(ShellResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        duration_ms: elapsed,
        timed_out: false,
    })
}

/// Validate a shell command for safety (additional checks beyond blocklist).
pub fn validate_command(command: &str) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("命令不能为空".into());
    }
    if trimmed.len() > 10000 {
        return Err("命令过长（最大 10000 字符）".into());
    }
    Ok(())
}
