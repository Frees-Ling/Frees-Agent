use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;
use tokio::fs;

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified: String,
}

#[derive(Serialize, Deserialize)]
pub struct ReadFileResult {
    pub content: String,
    pub lines: usize,
    pub size_bytes: u64,
    pub is_binary: bool,
}

#[command]
pub async fn read_file(path: String, max_size_kb: Option<u64>) -> Result<ReadFileResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    if !p.is_file() {
        return Err(format!("路径不是文件: {}", path));
    }

    let metadata = fs::metadata(p).await.map_err(|e| format!("无法读取文件元数据: {}", e))?;
    let size = metadata.len();
    let max_size = max_size_kb.unwrap_or(1024) * 1024;

    if size > max_size {
        return Err(format!("文件过大 ({} MB)，最大允许 {} MB", size / 1024 / 1024, max_size / 1024 / 1024));
    }

    let content = fs::read_to_string(p).await.map_err(|_| {
        // Try reading as binary
        "文件不是有效的文本文件".to_string()
    })?;

    let lines = content.lines().count();
    Ok(ReadFileResult {
        content,
        lines,
        size_bytes: size,
        is_binary: false,
    })
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).await.map_err(|e| format!("无法创建目录: {}", e))?;
    }
    fs::write(p, &content).await.map_err(|e| format!("无法写入文件: {}", e))?;
    Ok(())
}

#[command]
pub async fn list_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    let mut entries = Vec::new();
    let mut read_dir = fs::read_dir(p).await.map_err(|e| format!("无法读取目录: {}", e))?;

    loop {
        let entry = match read_dir.next_entry().await {
            Ok(Some(e)) => e,
            Ok(None) => break,
            Err(_) => continue,
        };

        let metadata = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified = metadata.modified()
            .ok()
            .map(|t| {
                let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                let secs = duration.as_secs();
                // Convert to ISO-like string
                format!("{}", secs)
            })
            .unwrap_or_default();

        entries.push(FileInfo {
            path: entry.path().to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size_bytes: metadata.len(),
            modified,
        });
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if p.is_dir() {
        fs::remove_dir_all(p).await.map_err(|e| format!("无法删除目录: {}", e))?;
    } else {
        fs::remove_file(p).await.map_err(|e| format!("无法删除文件: {}", e))?;
    }
    Ok(())
}

#[command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).await.map_err(|e| format!("无法创建目录: {}", e))?;
    Ok(())
}
