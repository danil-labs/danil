use std::process::Command;

/// Sella en el binario **de qué commit salió**.
fn sello() {
    let sha = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "desconocido".into());

    let sucio = Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);

    println!(
        "cargo:rustc-env=HARNESS_COMMIT={sha}{}",
        if sucio {
            " (con cambios sin commitear)"
        } else {
            ""
        }
    );
}

#[cfg(windows)]
fn manifiesto() -> tauri_build::Attributes {
    let ruta = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows.manifest");
    println!("cargo:rerun-if-changed=windows.manifest");
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", ruta.display());
    tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
}

#[cfg(not(windows))]
fn manifiesto() -> tauri_build::Attributes {
    tauri_build::Attributes::new()
}

fn main() {
    sello();
    tauri_build::try_build(manifiesto()).expect("tauri_build");
}
