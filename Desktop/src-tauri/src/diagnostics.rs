use crate::{engine, settings};
use std::time::{Duration, Instant};

pub fn write_info(app: &tauri::AppHandle) -> std::io::Result<()> {
    std::fs::write(
        settings::data_dir(app).join("desktop.txt"),
        format!(
            "MPE Desktop {}\nDesktop revision: {}\nPlatform: {}\n",
            env!("CARGO_PKG_VERSION"),
            crate::desktop_release::revision(),
            std::env::consts::OS
        ),
    )
}

pub fn archive(app: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    let binary = settings::engine_dir().join(settings::binary_name());
    let dir = settings::data_dir(app);
    if !binary.exists() {
        return crate::logs::archive(&dir);
    }
    let temporary = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = temporary.path().join("diagnostics.zip");
    let errors = temporary.path().join("errors.txt");
    let mut child = engine::command(&binary)
        .args(["logs", "export", "--output"])
        .arg(&output)
        .arg("--desktop-log-dir")
        .arg(&dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::fs::File::create(&errors).map_err(|e| e.to_string())?)
        .spawn()
        .map_err(|e| format!("启动诊断打包失败：{e}"))?;
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => {
                return Err(format!(
                    "诊断打包失败：{}",
                    std::fs::read_to_string(&errors).unwrap_or_default()
                ))
            }
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match result {
                    Err(err) => err.to_string(),
                    _ => "诊断打包超时，请检查日志文件大小".into(),
                });
            }
        }
    }
    std::fs::read(output).map_err(|e| e.to_string())
}
