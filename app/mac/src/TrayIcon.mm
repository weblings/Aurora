#include <Aurora/App/TrayIcon.hpp>

#import <AppKit/AppKit.h>

// The menu-item action target -- action selectors need a real NSObject,
// so this can't live behind the PIMPL boundary as a plain C++ type (same
// reasoning as AuroraSCKStreamOutput in ScreenCaptureKitGrabber.mm). Holds
// a non-owning pointer back to Impl; TrayIcon's destructor tears the menu
// down (and with it, any in-flight action dispatch) before Impl itself is
// destroyed.
@interface AuroraTrayMenuTarget : NSObject
@property (nonatomic, assign) Aurora::App::TrayIcon::Impl* impl;
- (void)onLaunch:(id)sender;
- (void)onStop:(id)sender;
@end

namespace Aurora::App
{
  struct TrayIcon::Impl
  {
    std::string url;
    bool webUiBound{false};
    std::function<void()> onLaunch;
    std::function<void()> onStop;

    NSStatusItem* statusItem = nil;
    AuroraTrayMenuTarget* target = nil;
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

@end

namespace Aurora::App
{

TrayIcon::TrayIcon(std::string url, bool webUiBound,
                    std::function<void()> onLaunch, std::function<void()> onStop):
m_impl(std::make_unique<Impl>())
{
  m_impl->url = std::move(url);
  m_impl->webUiBound = webUiBound;
  m_impl->onLaunch = std::move(onLaunch);
  m_impl->onStop = std::move(onStop);

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

  NSMenuItem* stopItem = [[NSMenuItem alloc] initWithTitle:@"Stop"
                                                      action:@selector(onStop:)
                                               keyEquivalent:@""];
  stopItem.target = target;
  [menu addItem:stopItem];

  item.menu = menu;

  m_impl->statusItem = item;
  m_impl->target = target;
}

TrayIcon::~TrayIcon()
{
  if(m_impl && m_impl->statusItem){
    [[NSStatusBar systemStatusBar] removeStatusItem:m_impl->statusItem];
  }
}

void TrayIcon::pump()
{
  // Non-blocking drain of whatever AppKit already has queued (status item
  // clicks, menu tracking) -- the direct analog of Windows'
  // PeekMessage(..., PM_REMOVE)/DispatchMessage pump. A 0 timeout still
  // services one already-available source before returning; it never
  // waits for one to arrive, so this adds no latency on top of the tick
  // loop's own pacing (sleep_until). Scoped to kCFRunLoopDefaultMode only
  // -- never kCFRunLoopCommonModes, which would fire inside
  // NSEventTrackingRunLoopMode and break menu tracking (tao-apps/tao#1324).
  CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, true);
}

} // namespace Aurora::App
