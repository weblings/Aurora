// Creates a virtual display with the private CGVirtualDisplay API, holds it,
// removes it, and logs every CGDisplayRegisterReconfigurationCallback flag
// set it sees, plus the active display count and the display UUID each time.
// Purpose (Aurora-h06o): learn which flags a real add and remove raise on this
// macOS, so the grabber's "does this reconfiguration change the monitor set"
// filter and its unit tests rest on observed values, and check whether a
// recreated display keeps its CGDisplayCreateUUIDFromDisplayID key (the saved
// monitor key, Aurora-5ipy.27). The display flickers on the host while it
// exists: windows may move. Private API: it can break on any macOS update.
//
// Build: clang -fobjc-arc -framework AppKit -framework ApplicationServices \
//          tools/mac/virtual-display-probe.m -o /tmp/virtual-display-probe
// Run:   /tmp/virtual-display-probe [--cycles N] [--hold SECONDS] [--serial N] [--pump run|hand] [--mirror 1] [--fast 1]
//        (callbacks arrive under [NSApp run]; --pump hand mirrors Aurora's own loop)
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ApplicationServices/ApplicationServices.h>

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(NSUInteger)width height:(NSUInteger)height refreshRate:(double)refreshRate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(retain, nonatomic) NSArray<CGVirtualDisplayMode*>* modes;
@property(nonatomic) unsigned int hiDPI;
@end

@interface CGVirtualDisplayDescriptor : NSObject
@property(retain, nonatomic) dispatch_queue_t queue;
@property(retain, nonatomic) NSString* name;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@end

@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor*)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings*)settings;
@property(readonly, nonatomic) CGDirectDisplayID displayID;
@end

static volatile BOOL gDone = NO;

static uint32_t activeCount(void)
{
  uint32_t count = 0;
  CGGetActiveDisplayList(0, NULL, &count);
  return count;
}

static void describeFlags(CGDisplayChangeSummaryFlags f, char* out, size_t n)
{
  out[0] = 0;
  struct { CGDisplayChangeSummaryFlags bit; const char* name; } table[] = {
    {kCGDisplayBeginConfigurationFlag, "BeginConfiguration"}, {kCGDisplayMovedFlag, "Moved"},
    {kCGDisplaySetMainFlag, "SetMain"}, {kCGDisplaySetModeFlag, "SetMode"},
    {kCGDisplayAddFlag, "Add"}, {kCGDisplayRemoveFlag, "Remove"},
    {kCGDisplayEnabledFlag, "Enabled"}, {kCGDisplayDisabledFlag, "Disabled"},
    {kCGDisplayMirrorFlag, "Mirror"}, {kCGDisplayUnMirrorFlag, "UnMirror"},
    {kCGDisplayDesktopShapeChangedFlag, "DesktopShapeChanged"},
  };
  for(size_t i = 0; i < sizeof(table) / sizeof(table[0]); ++i){
    if(f & table[i].bit){
      strlcat(out, out[0] ? "|" : "", n);
      strlcat(out, table[i].name, n);
    }
  }
  if(!out[0]){ strlcpy(out, "(none)", n); }
}

static NSString* uuidOf(CGDirectDisplayID id)
{
  CFUUIDRef u = CGDisplayCreateUUIDFromDisplayID(id);
  if(!u){ return @"(no uuid)"; }
  NSString* s = CFBridgingRelease(CFUUIDCreateString(NULL, u));
  CFRelease(u);
  return s;
}

static void onReconfigure(CGDirectDisplayID display, CGDisplayChangeSummaryFlags flags, void* ctx)
{
  char text[256];
  describeFlags(flags, text, sizeof(text));
  printf("  [callback] display %u uuid %s flags 0x%x %s\n", display,
         [uuidOf(display) UTF8String], (unsigned)flags, text);
  fflush(stdout);
}

static void pump(double seconds)
{
  [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:seconds]];
}

int main(int argc, char** argv)
{
  @autoreleasepool {
    int cycles = 2; double hold = 4; unsigned serial = 4242; BOOL handPump = NO; BOOL mirror = NO; double settle = 1.5, gap = 3;
    for(int i = 1; i + 1 < argc; i += 2){
      if(!strcmp(argv[i], "--cycles")) cycles = atoi(argv[i + 1]);
      else if(!strcmp(argv[i], "--hold")) hold = atof(argv[i + 1]);
      else if(!strcmp(argv[i], "--serial")) serial = (unsigned)atoi(argv[i + 1]);
      else if(!strcmp(argv[i], "--pump")) handPump = !strcmp(argv[i + 1], "hand");
      else if(!strcmp(argv[i], "--mirror")) mirror = !strcmp(argv[i + 1], "1");
      else if(!strcmp(argv[i], "--fast") && !strcmp(argv[i + 1], "1")){ settle = 0.3; gap = 0.3; }
    }
    if(!NSClassFromString(@"CGVirtualDisplay")){
      fprintf(stderr, "CGVirtualDisplay is not present on this macOS\n");
      return 2;
    }
    // A bare command-line tool has no WindowServer connection and receives no
    // reconfiguration callbacks; connecting as an accessory app (no Dock icon,
    // like Aurora's LSUIElement) fixes that.
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    CGDisplayRegisterReconfigurationCallback(onReconfigure, NULL);
    // The other signal Aurora-h06o names: AppKit's screen-parameters notification.
    id observer = [[NSNotificationCenter defaultCenter]
      addObserverForName:NSApplicationDidChangeScreenParametersNotification object:nil queue:nil
      usingBlock:^(NSNotification* n){
        printf("  [notification] NSApplicationDidChangeScreenParameters, %lu NSScreen(s), %u active\n",
               (unsigned long)[NSScreen screens].count, activeCount());
        fflush(stdout);
      }];
    (void)observer;
    printf("start: %u active display(s)\n", activeCount());

    // Drive the cycles from timers and run a real NSApplication event loop:
    // a hand-pumped run loop never received the callbacks or the notification.
    __block int cycle = 0;
    __block CGVirtualDisplay* v = nil;
    __block void (^create)(void);
    __block void (^remove)(void);
    create = ^{
      ++cycle;
      printf("cycle %d: creating virtual display (serial %u)\n", cycle, serial);
      CGVirtualDisplayDescriptor* d = [[CGVirtualDisplayDescriptor alloc] init];
      d.queue = dispatch_get_main_queue();
      d.name = @"Aurora Test Display";
      d.maxPixelsWide = 1920; d.maxPixelsHigh = 1080;
      d.sizeInMillimeters = CGSizeMake(527, 296);
      d.vendorID = 0xA0A0; d.productID = 0x0001; d.serialNum = serial;
      v = [[CGVirtualDisplay alloc] initWithDescriptor:d];
      CGVirtualDisplaySettings* s = [[CGVirtualDisplaySettings alloc] init];
      s.hiDPI = 0;
      s.modes = @[[[CGVirtualDisplayMode alloc] initWithWidth:1920 height:1080 refreshRate:60]];
      BOOL ok = v ? [v applySettings:s] : NO;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(settle * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        printf("  created=%s id=%u uuid=%s, %u active display(s)\n", ok ? "yes" : "NO",
               v ? v.displayID : 0, v ? [uuidOf(v.displayID) UTF8String] : "-", activeCount());
        fflush(stdout);
      });
      if(mirror){
        // Mirror the virtual display onto the main one 3 s in, undo it 3 s later.
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
          CGDisplayConfigRef cfg; CGBeginDisplayConfiguration(&cfg);
          CGConfigureDisplayMirrorOfDisplay(cfg, v.displayID, CGMainDisplayID());
          printf("  mirroring virtual display onto main: %d\n", (int)CGCompleteDisplayConfiguration(cfg, kCGConfigureForSession)); fflush(stdout);
        });
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(7.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
          CGDisplayConfigRef cfg; CGBeginDisplayConfiguration(&cfg);
          CGConfigureDisplayMirrorOfDisplay(cfg, v.displayID, kCGNullDirectDisplay);
          printf("  unmirroring: %d\n", (int)CGCompleteDisplayConfiguration(cfg, kCGConfigureForSession)); fflush(stdout);
        });
      }
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((settle + hold) * NSEC_PER_SEC)), dispatch_get_main_queue(), remove);
    };
    remove = ^{
      printf("cycle %d: removing it\n", cycle);
      v = nil;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(gap * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        printf("  after remove: %u active display(s)\n", activeCount());
        fflush(stdout);
        if(cycle < cycles){ create(); } else { gDone = YES; [NSApp stop:nil]; [NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0] atStart:YES]; }
      });
    };
    create();
    if(handPump){
      // Same loop shape as Aurora's TrayIcon::pump (app/mac/src/TrayIcon.mm):
      // finishLaunching once, then nextEventMatchingMask + sendEvent, never -run.
      printf("pump: hand (Aurora's TrayIcon::pump shape)\n");
      [NSApp finishLaunching];
      while(!gDone){
        NSEvent* event;
        NSDate* until = [NSDate dateWithTimeIntervalSinceNow:0.25];
        while((event = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:until
                                             inMode:NSDefaultRunLoopMode dequeue:YES]) != nil){
          [NSApp sendEvent:event];
          until = [NSDate distantPast];
        }
      }
    }
    else{
      printf("pump: [NSApp run]\n");
      [NSApp run];
    }
    CGDisplayRemoveReconfigurationCallback(onReconfigure, NULL);
    printf("done: %u active display(s)\n", activeCount());
  }
  return 0;
}
