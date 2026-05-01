use chrono::Local;
use serde::{Deserialize, Serialize};
use sysinfo::{Disks, Networks, System, CpuRefreshKind};
use std::net::TcpListener;

#[derive(Serialize, Deserialize)]
pub struct SystemInfo {
    pub timestamp: String,
    pub date: String,
    pub time: String,
    pub timezone: String,
    pub platform: String,
    pub os_type: String,
    pub os_version: String,
    pub hostname: String,
    pub arch: String,
    pub uptime_secs: u64,
    pub cpu_brand: String,
    pub cpu_cores: usize,
    pub memory_total_gb: f64,
    pub memory_used_gb: f64,
    pub memory_used_pct: f64,
    pub disk_total_gb: f64,
    pub disk_used_gb: f64,
    pub disk_used_pct: f64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub processes: usize,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_pct: f32,
    pub memory_mb: f64,
    pub status: String,
}

/// Gather comprehensive system information.
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let now = Local::now();
    let disks = Disks::new_with_refreshed_list();
    let networks = Networks::new_with_refreshed_list();

    let disk_total: u64 = disks.iter().map(|d| d.total_space()).sum();
    let disk_used: u64 = disks.iter().map(|d| d.total_space() - d.available_space()).sum();

    let (rx, tx) = networks.iter().fold((0, 0), |(r, t), (_, n)| {
        (r + n.total_received(), t + n.total_transmitted())
    });

    // hostname: use sysinfo hostname (cross-platform), fall back to env vars
    let hostname = System::host_name()
        .or_else(|| std::env::var("HOSTNAME").ok())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .unwrap_or_else(|| "unknown".into());

    SystemInfo {
        timestamp: now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        date: now.format("%Y-%m-%d").to_string(),
        time: now.format("%H:%M:%S").to_string(),
        timezone: now.format("%Z").to_string(),
        platform: std::env::consts::OS.to_string(),
        os_type: System::long_os_version().unwrap_or_default(),
        os_version: System::kernel_version().unwrap_or_default(),
        hostname,
        arch: std::env::consts::ARCH.to_string(),
        uptime_secs: System::uptime(),
        cpu_brand: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        cpu_cores: sys.cpus().len(),
        memory_total_gb: sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0,
        memory_used_gb: sys.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0,
        memory_used_pct: if sys.total_memory() > 0 {
            sys.used_memory() as f64 / sys.total_memory() as f64 * 100.0
        } else {
            0.0
        },
        disk_total_gb: disk_total as f64 / 1024.0 / 1024.0 / 1024.0,
        disk_used_gb: disk_used as f64 / 1024.0 / 1024.0 / 1024.0,
        disk_used_pct: if disk_total > 0 {
            disk_used as f64 / disk_total as f64 * 100.0
        } else {
            0.0
        },
        network_rx_bytes: rx,
        network_tx_bytes: tx,
        processes: sys.processes().len(),
    }
}

/// List running processes.
pub fn list_processes() -> Vec<ProcessInfo> {
    let mut sys = System::new_all();
    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    sys.processes()
        .iter()
        .map(|(pid, process)| ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().to_string(),
            cpu_pct: process.cpu_usage(),
            memory_mb: process.memory() as f64 / 1024.0,
            status: format!("{:?}", process.status()),
        })
        .collect()
}

/// Check if a port is available.
pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}
