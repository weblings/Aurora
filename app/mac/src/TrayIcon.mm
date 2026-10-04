#include <Aurora/App/TrayIcon.hpp>

#import <AppKit/AppKit.h>

// The menu-item action target -- action selectors need a real NSObject,
// so this can't live behind the PIMPL boundary as a plain C++ type (same
// reasoning as AuroraSCKStreamOutput in ScreenCaptureKitGrabber.mm). Holds
// a non-owning pointer back to Impl; TrayIcon's destructor tears the menu
// down (and with it, any in-flight action dispatch) before Impl itself is
// destroyed.
@interface AuroraTrayMenuTarget : NSObject <NSMenuDelegate>
@property (nonatomic, assign) Aurora::App::TrayIcon::Impl* impl;
- (void)onLaunch:(id)sender;
- (void)onStop:(id)sender;
- (void)onTogglePause:(id)sender;
@end

// Catches LaunchServices' reopen signal (Aurora-qps.7): with no Dock icon
// (LSUIElement, Aurora-qps.3) and no window, a second `open`/double-click
// while Aurora is already running is otherwise silent -- LaunchServices
// never spawns a second process (Aurora-qps.4 confirmed InstanceLock's own
// "second launch opens the URL and exits" logic never runs on Mac), it
// just sends this app the standard reopen Apple Event instead. Needs
// TrayIcon::pump() to actually drain AppKit's event queue via -sendEvent:
// -- verified empirically that the bare CFRunLoopRunInMode pump this
// shipped with in Aurora-qps.2 never delivers this event at all, regardless
// of accessory status or handler style (a throwaway probe checked both).
@interface AuroraTrayAppDelegate : NSObject <NSApplicationDelegate>
@property (nonatomic, assign) Aurora::App::TrayIcon::Impl* impl;
@end

namespace Aurora::App
{
  struct TrayIcon::Impl
  {
    std::string url;
    bool webUiBound{false};
    std::function<void()> onLaunch;
    std::function<void()> onStop;
    std::function<void()> onTogglePause;
    std::function<bool()> isPaused;

    NSStatusItem* statusItem = nil;
    AuroraTrayMenuTarget* target = nil;
    NSMenuItem* pauseItem = nil;
    AuroraTrayAppDelegate* appDelegate = nil;
  };
}

@implementation AuroraTrayMenuTarget

- (void)onLaunch:(id)sender
{
  if(self.impl && self.impl->onLaunch){ self.impl->onLaunch(); }
}

- (void)onStop:(id)sender
{
  if(self.impl && self.impl->onStop){ self.impl->onStop(); }
}

- (void)onTogglePause:(id)sender
{
  if(self.impl && self.impl->onTogglePause){ self.impl->onTogglePause(); }
}

// Runs on the main thread each time the menu is about to open, so the
// Pause/Resume label reflects a state change made elsewhere (Dashboard,
// API) with no push needed.
- (void)menuNeedsUpdate:(NSMenu*)menu
{
  if(!self.impl || !self.impl->pauseItem || !self.impl->isPaused){ return; }
  self.impl->pauseItem.title = self.impl->isPaused() ? @"Resume" : @"Pause";
}

@end

@implementation AuroraTrayAppDelegate

- (BOOL)applicationShouldHandleReopen:(NSApplication*)sender hasVisibleWindows:(BOOL)hasVisibleWindows
{
  if(self.impl && self.impl->onLaunch){ self.impl->onLaunch(); }
  return YES;
}

@end

namespace Aurora::App
{

TrayIcon::TrayIcon(std::string url, bool webUiBound,
                    std::function<void()> onLaunch, std::function<void()> onStop,
                    std::function<void()> onTogglePause, std::function<bool()> isPaused):
m_impl(std::make_unique<Impl>())
{
  m_impl->url = std::move(url);
  m_impl->webUiBound = webUiBound;
  m_impl->onLaunch = std::move(onLaunch);
  m_impl->onStop = std::move(onStop);
  m_impl->onTogglePause = std::move(onTogglePause);
  m_impl->isPaused = std::move(isPaused);

  // First (and, for this tier, only) AppKit consumer in app/mac -- owns the
  // one-time bootstrap. No activation-policy call here: this phase
  // (Aurora-qps.2) ships the tray icon with the Dock icon still showing;
  // agent mode (LSUIElement, hiding the Dock icon) is Aurora-qps.3,
  // sequenced separately so each phase's effect can be verified in
  // isolation.
  [NSApplication sharedApplication];
  // -run normally calls this as part of AppKit's own startup; main()
  // never calls -run (it pumps manually via pump() instead), so this has
  // to happen explicitly, or the status item's first click goes
  // unserviced -- verified missing (then fixed) in Aurora-qps.1's probe.
  [NSApp finishLaunching];

  AuroraTrayAppDelegate* appDelegate = [[AuroraTrayAppDelegate alloc] init];
  appDelegate.impl = m_impl.get();
  NSApp.delegate = appDelegate;
  m_impl->appDelegate = appDelegate;

  NSImage* icon = [[NSBundle mainBundle] imageForResource:@"tray-icon"];
  // Discards the icon's RGB, uses only alpha as a mask -- AppKit then
  // paints it itself (dark in a light menu bar, white in a dark one, white
  // again while highlighted). The source PNG can stay full-color as
  // exported; no separate blackened asset is needed. Falls back to a
  // system symbol if the bundle resource is missing (e.g. a non-bundle
  // dev build invoking the inner binary directly) rather than showing a
  // blank status item.
  if(icon){
    // Not `icon.template = YES` -- `template` is a C++ keyword, so dot
    // syntax on NSImage's `template` property doesn't compile in
    // Objective-C++. The setter message avoids that entirely.
    [icon setTemplate:YES];
  }
  else{
    icon = [NSImage imageWithSystemSymbolName:@"sparkles" accessibilityDescription:@"Aurora"];
  }

  NSStatusItem* item = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
  item.button.image = icon;
  item.button.toolTip = @"Aurora";

  AuroraTrayMenuTarget* target = [[AuroraTrayMenuTarget alloc] init];
  target.impl = m_impl.get();

  NSMenu* menu = [[NSMenu alloc] init];
  NSMenuItem* launchItem = [[NSMenuItem alloc] initWithTitle:@"Launch UI"
                                                        action:@selector(onLaunch:)
                                                 keyEquivalent:@""];
  launchItem.target = target;
  launchItem.enabled = webUiBound;
  [menu addItem:launchItem];

  NSMenuItem* pauseItem = [[NSMenuItem alloc] initWithTitle:
                              (m_impl->isPaused && m_impl->isPaused()) ? @"Resume" : @"Pause"
                                                      action:@selector(onTogglePause:)
                                               keyEquivalent:@""];
  pauseItem.target = target;
  [menu addItem:pauseItem];

  NSMenuItem* stopItem = [[NSMenuItem alloc] initWithTitle:@"Stop"
                                                      action:@selector(onStop:)
                                               keyEquivalent:@""];
  stopItem.target = target;
  [menu addItem:stopItem];

  menu.delegate = target;
  item.menu = menu;

  m_impl->statusItem = item;
  m_impl->target = target;
  m_impl->pauseItem = pauseItem;
}

TrayIcon::~TrayIcon()
{
  if(m_impl && m_impl->statusItem){
    [[NSStatusBar systemStatusBar] removeStatusItem:m_impl->statusItem];
  }
}

void TrayIcon::pump(double timeoutSeconds)
{
  // Waits up to timeoutSeconds for AppKit's next event, then drains what's
  // queued -- the analog of Windows' GetMessage/DispatchMessage pump, with
  // a timeout so main()'s loop can notice the stop flag.
  //
  // Aurora-qps.2 shipped this as a bare CFRunLoopRunInMode(kCFRunLoopDefaultMode,
  // 0, true) call, which was enough to service NSStatusItem clicks (verified
  // in Aurora-qps.1) but -- discovered while chasing Aurora-qps.7 -- never
  // delivers Apple Events (including the reopen event LaunchServices sends
  // on a second launch): those route through -sendEvent:, which bare
  // CFRunLoopRunInMode never calls. Verified empirically with a throwaway
  // probe: identical handler code (both the applicationShouldHandleReopen:
  // delegate method and a raw NSAppleEventManager registration) never fired
  // under the old pump, regardless of accessory (LSUIElement) status: fired
  // reliably under this one. NSDefaultRunLoopMode is Foundation's name for
  // the same mode as kCFRunLoopDefaultMode -- still never common modes, so
  // the tao-apps/tao#1324 menu-tracking constraint still holds.
  NSEvent* event;
  NSDate* until = [NSDate dateWithTimeIntervalSinceNow:timeoutSeconds];
  while((event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                      untilDate:until
                                         inMode:NSDefaultRunLoopMode
                                        dequeue:YES]) != nil){
    [NSApp sendEvent:event];
    until = [NSDate distantPast]; // drain the rest without waiting again
  }
}

void TrayIcon::cancelMenuTracking()
{
  // The dispatch block outlives no state it doesn't own: it captures the
  // NSMenu strongly, so it stays valid even if ~TrayIcon runs first.
  NSMenu* menu = m_impl ? m_impl->statusItem.menu : nil;
  if(menu == nil){ return; }
  dispatch_async(dispatch_get_main_queue(), ^{ [menu cancelTracking]; });
}

} // namespace Aurora::App
