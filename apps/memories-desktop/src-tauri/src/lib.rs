use std::process::Child;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Fixed port for the Bun memories server (must match `tauri.conf.json` devUrl / spawn env).
pub const MEMORIES_SERVER_PORT: u16 = 31_416;

pub struct SidecarState {
  pub child: Mutex<Option<Child>>,
}

impl Default for SidecarState {
  fn default() -> Self {
    Self {
      child: Mutex::new(None),
    }
  }
}

fn wait_for_localhost_port(port: u16) -> Result<(), String> {
  use std::net::TcpStream;
  let deadline = Instant::now() + Duration::from_secs(90);
  while Instant::now() < deadline {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(120));
  }
  Err(format!("timeout waiting for 127.0.0.1:{port}"))
}

#[cfg(unix)]
fn terminate_child_gracefully(child: &mut Child) {
  let pid = child.id() as libc::pid_t;
  unsafe {
    libc::kill(pid, libc::SIGTERM);
  }
  let deadline = Instant::now() + Duration::from_secs(8);
  while Instant::now() < deadline {
    if child.try_wait().ok().flatten().is_some() {
      return;
    }
    thread::sleep(Duration::from_millis(50));
  }
  let _ = child.kill();
}

#[cfg(not(unix))]
fn terminate_child_gracefully(child: &mut Child) {
  let _ = child.kill();
}

#[cfg(not(debug_assertions))]
fn forward_server_env(cmd: &mut std::process::Command) {
  cmd.env("PORT", MEMORIES_SERVER_PORT.to_string());
  for key in [
    "MEMORIES_DB_PATH",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "MEMORIES_SEARCH_EMBEDDING_PRESET",
  ] {
    if let Ok(v) = std::env::var(key) {
      cmd.env(key, v);
    }
  }
}

/// Release only: bundled `memories-server-<rustc host triple>` next to `Resources`.
#[cfg(not(debug_assertions))]
fn spawn_memories_sidecar(app: &tauri::App) -> Result<(), String> {
  let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
  let binaries_dir = resource_dir.join("binaries");
  let bin = std::fs::read_dir(&binaries_dir)
    .map_err(|e| format!("read {}: {e}", binaries_dir.display()))?
    .filter_map(|e| e.ok())
    .map(|e| e.path())
    .find(|p| {
      p.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("memories-server-"))
    })
    .ok_or_else(|| {
      format!(
        "no memories-server-* binary in {}",
        binaries_dir.display()
      )
    })?;
  if !bin.is_file() {
    return Err(format!("sidecar not found: {}", bin.display()));
  }

  let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

  let mut cmd = std::process::Command::new(&bin);
  cmd.current_dir(&config_dir);
  forward_server_env(&mut cmd);

  let child = cmd.spawn().map_err(|e| format!("spawn sidecar {}: {e}", bin.display()))?;
  *app
    .state::<SidecarState>()
    .child
    .lock()
    .map_err(|_| "sidecar mutex poisoned".to_string())? = Some(child);
  Ok(())
}

fn create_main_window(app: &AppHandle) -> Result<(), String> {
  let url = Url::parse(&format!("http://127.0.0.1:{}/", MEMORIES_SERVER_PORT))
    .map_err(|e| e.to_string())?;
  let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
    .title("Memories")
    .inner_size(1200.0, 800.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

  let w = window.clone();
  window.on_window_event(move |event| {
    if let WindowEvent::CloseRequested { api, .. } = event {
      api.prevent_close();
      let _ = w.hide();
    }
  });

  Ok(())
}

fn build_tray(app: &AppHandle) -> Result<(), String> {
  let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>).map_err(|e| e.to_string())?;
  let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>).map_err(|e| e.to_string())?;
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
  let menu = Menu::new(app).map_err(|e| e.to_string())?;
  menu
    .append_items(&[&show, &hide, &quit])
    .map_err(|e| e.to_string())?;

  let icon = app
    .default_window_icon()
    .ok_or_else(|| "missing default window icon".to_string())?
    .clone();

  let _tray = TrayIconBuilder::new()
    .icon(icon)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(move |app, event| {
      if event.id == "show" {
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.show();
          let _ = w.set_focus();
        }
      } else if event.id == "hide" {
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.hide();
        }
      } else if event.id == "quit" {
        app.exit(0);
      }
    })
    .build(app)
    .map_err(|e| e.to_string())?;

  Ok(())
}

fn cleanup_sidecar(app_handle: &AppHandle) {
  if let Some(state) = app_handle.try_state::<SidecarState>() {
    if let Ok(mut g) = state.child.lock() {
      if let Some(mut child) = g.take() {
        terminate_child_gracefully(&mut child);
      }
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SidecarState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        let _ = app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        );
      }

      #[cfg(not(debug_assertions))]
      {
        spawn_memories_sidecar(app)?;
      }

      wait_for_localhost_port(MEMORIES_SERVER_PORT).map_err(|e| -> Box<dyn std::error::Error> {
        e.into()
      })?;

      create_main_window(app.handle()).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
      build_tray(app.handle()).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::Exit = event {
        cleanup_sidecar(app_handle);
      }
    });
}
