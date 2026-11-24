//! ASWebAuthenticationSession efímera; el código sigue entrando por loopback.
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, AnyProtocol, ClassBuilder, Sel};
use objc2::{msg_send, sel};
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::sync::{
    atomic::{AtomicU64, AtomicU8, Ordering},
    mpsc, Arc,
};
use std::time::Duration;
use tauri::AppHandle;

#[link(name = "AuthenticationServices", kind = "framework")]
extern "C" {}
thread_local! {
    static SESSIONS: RefCell<HashMap<u64, (Retained<AnyObject>, Retained<AnyObject>)>> = RefCell::default();
}
static NEXT: AtomicU64 = AtomicU64::new(1);

const STATE_RUNNING: u8 = 0;
const STATE_CANCELLED: u8 = 1;
const STATE_FAILED: u8 = 2;
const AUTH_ERROR_DOMAIN: &str = "com.apple.AuthenticationServices.WebAuthenticationSession";
const AUTH_ERROR_CANCELED_LOGIN: isize = 1;

pub(crate) struct PrivateLogin {
    app: AppHandle,
    id: u64,
    state: Arc<AtomicU8>,
}
impl PrivateLogin {
    pub fn open(app: &AppHandle, url: String) -> Result<Self, Value> {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let state = Arc::new(AtomicU8::new(STATE_RUNNING));
        let done = state.clone();
        let (send, recv) = mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let result = unsafe { start(&url, done) };
            let ok = if let Some(objects) = result {
                SESSIONS.with(|sessions| sessions.borrow_mut().insert(id, objects));
                true
            } else {
                false
            };
            let _ = send.send(ok);
        })
        .map_err(|err| {
            log::warn!("desk_auth: no se pudo despachar login privado al hilo principal: {err}");
            super::super::coded("browser")
        })?;
        match recv.recv_timeout(Duration::from_secs(10)) {
            Ok(true) => Ok(Self {
                app: app.clone(),
                id,
                state,
            }),
            other => {
                log::warn!("desk_auth: fallo al iniciar ASWebAuthenticationSession: {other:?}");
                let app = app.clone();
                let _ = app.run_on_main_thread(move || remove(id));
                Err(super::super::coded("browser"))
            }
        }
    }
    pub fn cancelled(&self) -> bool {
        self.state.load(Ordering::Acquire) == STATE_CANCELLED
    }
    pub fn failed(&self) -> bool {
        self.state.load(Ordering::Acquire) == STATE_FAILED
    }
}
impl Drop for PrivateLogin {
    fn drop(&mut self) {
        let id = self.id;
        let _ = self.app.run_on_main_thread(move || remove(id));
    }
}
fn remove(id: u64) {
    if let Some((session, _provider)) = SESSIONS.with(|s| s.borrow_mut().remove(&id)) {
        unsafe {
            let _: () = msg_send![&*session, cancel];
        }
    }
}

fn classify_error(domain: Option<&str>, code: isize) -> u8 {
    match domain {
        None => STATE_CANCELLED,
        Some(AUTH_ERROR_DOMAIN) if code == AUTH_ERROR_CANCELED_LOGIN => STATE_CANCELLED,
        Some(_) => STATE_FAILED,
    }
}

unsafe fn nsstring_to_string(ptr: *mut AnyObject) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let utf8: *const std::ffi::c_char = msg_send![ptr, UTF8String];
    if utf8.is_null() {
        return None;
    }
    Some(CStr::from_ptr(utf8).to_string_lossy().into_owned())
}

unsafe fn first_window(array: *mut AnyObject, only_visible: bool) -> *mut AnyObject {
    if array.is_null() {
        return std::ptr::null_mut();
    }
    let count: usize = msg_send![array, count];
    for index in 0..count {
        let win: *mut AnyObject = msg_send![array, objectAtIndex: index];
        if win.is_null() {
            continue;
        }
        if !only_visible {
            return win;
        }
        let visible: bool = msg_send![win, isVisible];
        if visible {
            return win;
        }
    }
    std::ptr::null_mut()
}

unsafe fn presentation_window() -> *mut AnyObject {
    let Some(class) = AnyClass::get(c"NSApplication") else {
        return std::ptr::null_mut();
    };
    let app: *mut AnyObject = msg_send![class, sharedApplication];
    if app.is_null() {
        return std::ptr::null_mut();
    }
    let main: *mut AnyObject = msg_send![app, mainWindow];
    if !main.is_null() {
        return main;
    }
    let key: *mut AnyObject = msg_send![app, keyWindow];
    if !key.is_null() {
        return key;
    }
    let ordered: *mut AnyObject = msg_send![app, orderedWindows];
    let visible_ordered = first_window(ordered, true);
    if !visible_ordered.is_null() {
        return visible_ordered;
    }
    let windows: *mut AnyObject = msg_send![app, windows];
    let visible = first_window(windows, true);
    if !visible.is_null() {
        return visible;
    }
    first_window(windows, false)
}

extern "C-unwind" fn anchor(
    _this: &AnyObject,
    _cmd: Sel,
    _session: *mut AnyObject,
) -> *mut AnyObject {
    unsafe { presentation_window() }
}
unsafe fn provider() -> Option<Retained<AnyObject>> {
    let class = if let Some(class) = AnyClass::get(c"DanilPrivateLoginAnchor") {
        class
    } else {
        let mut builder =
            ClassBuilder::new(c"DanilPrivateLoginAnchor", AnyClass::get(c"NSObject")?)?;
        builder.add_protocol(AnyProtocol::get(
            c"ASWebAuthenticationPresentationContextProviding",
        )?);
        builder.add_method(
            sel!(presentationAnchorForWebAuthenticationSession:),
            anchor as extern "C-unwind" fn(_, _, _) -> _,
        );
        builder.register()
    };
    let allocated: *mut AnyObject = msg_send![class, alloc];
    let initialized: *mut AnyObject = msg_send![allocated, init];
    Retained::from_raw(initialized)
}
unsafe fn start(
    url: &str,
    state: Arc<AtomicU8>,
) -> Option<(Retained<AnyObject>, Retained<AnyObject>)> {
    if presentation_window().is_null() {
        log::warn!(
            "desk_auth: no hay ventana de presentación disponible para ASWebAuthenticationSession"
        );
        return None;
    }
    let class = AnyClass::get(c"ASWebAuthenticationSession")?;
    let string_class = AnyClass::get(c"NSString")?;
    let url_class = AnyClass::get(c"NSURL")?;
    let raw = CString::new(url).ok()?;
    let text: *mut AnyObject = msg_send![string_class, stringWithUTF8String: raw.as_ptr()];
    if text.is_null() {
        log::warn!("desk_auth: NSString devolvió nil para la URL de login");
        return None;
    }
    let nsurl: *mut AnyObject = msg_send![url_class, URLWithString: text];
    if nsurl.is_null() {
        log::warn!("desk_auth: NSURL devolvió nil para la URL de login");
        return None;
    }
    let completion = block2::RcBlock::new(move |_url: *mut AnyObject, error: *mut AnyObject| {
        let next = if error.is_null() {
            log::info!("desk_auth: ASWebAuthenticationSession cerró sin error");
            STATE_CANCELLED
        } else {
            let (domain, code, description) = unsafe {
                let domain_obj: *mut AnyObject = msg_send![error, domain];
                let code: isize = msg_send![error, code];
                let desc_obj: *mut AnyObject = msg_send![error, localizedDescription];
                (
                    nsstring_to_string(domain_obj),
                    code,
                    nsstring_to_string(desc_obj).unwrap_or_default(),
                )
            };
            let classified = classify_error(domain.as_deref(), code);
            if classified == STATE_CANCELLED {
                log::info!(
                    "desk_auth: ASWebAuthenticationSession cancelada (domain={domain:?}, code={code})"
                );
            } else {
                log::warn!(
                    "desk_auth: ASWebAuthenticationSession falló (domain={domain:?}, code={code}, desc={description})"
                );
            }
            classified
        };
        let _ = state.compare_exchange(STATE_RUNNING, next, Ordering::AcqRel, Ordering::Acquire);
    });
    let allocated: *mut AnyObject = msg_send![class, alloc];
    // Sin esquema personalizado: el servidor local recibe el callback HTTP.
    let initialized: *mut AnyObject = msg_send![allocated, initWithURL: nsurl, callbackURLScheme: std::ptr::null::<AnyObject>(), completionHandler: &*completion];
    let session = Retained::from_raw(initialized)?;
    let provider = provider()?;
    let _: () = msg_send![&*session, setPresentationContextProvider: &*provider];
    if !isolate(&session) {
        log::warn!("desk_auth: no se pudo activar prefersEphemeralWebBrowserSession");
        return None;
    }
    let has_can_start: bool = msg_send![&*session, respondsToSelector: sel!(canStart)];
    if has_can_start {
        let can_start: bool = msg_send![&*session, canStart];
        if !can_start {
            log::warn!("desk_auth: ASWebAuthenticationSession canStart devolvió false");
            return None;
        }
    }
    let started: bool = msg_send![&*session, start];
    if !started {
        log::warn!("desk_auth: ASWebAuthenticationSession start devolvió false");
        return None;
    }
    Some((session, provider))
}

unsafe fn isolate(session: &AnyObject) -> bool {
    let _: () = msg_send![session, setPrefersEphemeralWebBrowserSession: true];
    msg_send![session, prefersEphemeralWebBrowserSession]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_authentication_session_requests_ephemeral_cookies() {
        objc2::rc::autoreleasepool(|_| unsafe {
            let class = AnyClass::get(c"ASWebAuthenticationSession").unwrap();
            let allocated: *mut AnyObject = msg_send![class, alloc];
            let text: *mut AnyObject = msg_send![AnyClass::get(c"NSString").unwrap(), stringWithUTF8String: c"https://edge.example.test/v1/identity/desk/authorize?mode=add".as_ptr()];
            let url: *mut AnyObject =
                msg_send![AnyClass::get(c"NSURL").unwrap(), URLWithString:text];
            let completion = block2::RcBlock::new(|_: *mut AnyObject, _: *mut AnyObject| {});
            let initialized: *mut AnyObject = msg_send![allocated, initWithURL:url, callbackURLScheme: std::ptr::null::<AnyObject>(), completionHandler:&*completion];
            let session = Retained::from_raw(initialized).unwrap();
            assert!(isolate(&session));
            let ephemeral: bool = msg_send![&*session, prefersEphemeralWebBrowserSession];
            assert!(ephemeral);
        });
    }

    #[test]
    fn classifies_cancel_and_presentation_errors() {
        assert_eq!(
            classify_error(Some(AUTH_ERROR_DOMAIN), AUTH_ERROR_CANCELED_LOGIN),
            STATE_CANCELLED
        );
        assert_eq!(classify_error(None, 0), STATE_CANCELLED);
        assert_eq!(classify_error(Some(AUTH_ERROR_DOMAIN), 2), STATE_FAILED);
        assert_eq!(classify_error(Some(AUTH_ERROR_DOMAIN), 3), STATE_FAILED);
        assert_eq!(classify_error(Some("OtherDomain"), 1), STATE_FAILED);
    }
}
