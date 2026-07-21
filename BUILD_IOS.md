# iOS App Store Build Guide — Stack Bargains

This guide walks you through publishing the Stack Bargains web app as a native iOS app on the Apple App Store using Capacitor.

---

## What You Need Before Starting

| Requirement | Where to get it |
|---|---|
| Mac (MacBook, iMac, Mac Mini) | Required — Xcode only runs on macOS |
| Xcode 15+ | Mac App Store (free) |
| Apple Developer Account | developer.apple.com ($99/year) |
| Your Railway URL | Railway dashboard → your project → Settings → Domains |

---

## Step 1 — Set Your Railway URL

Open `capacitor.config.ts` and replace the placeholder:

```ts
const PRODUCTION_URL = 'https://YOUR-APP.up.railway.app';
//                            ↑ replace this with your actual Railway URL
```

Example:
```ts
const PRODUCTION_URL = 'https://whatnot-tracker-production.up.railway.app';
```

Commit this change to GitHub so it's on your Mac when you clone.

---

## Step 2 — On Your Mac: Clone and Set Up

Open Terminal on your Mac and run:

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/whatnot-tracker.git
cd whatnot-tracker

# Install dependencies
npm install

# Add the iOS platform (creates the ios/ folder)
npm run cap:add:ios

# Sync Capacitor config into the iOS project
npm run cap:sync
```

> `ios/` will be created locally. You don't need to commit it.

---

## Step 3 — App Icons and Splash Screen

Apple requires an app icon at **1024×1024 px, PNG, no transparency, no rounded corners** (Apple rounds them automatically).

### Quick way (free): Use an online generator

1. Create a 1024×1024 PNG of the Stack Bargains logo (amber background, white logo)
2. Go to **[appicon.co](https://www.appicon.co)** → upload your 1024×1024 PNG → download
3. Copy all the generated `.xcassets` folders into:
   ```
   ios/App/App/Assets.xcassets/AppIcon.appiconset/
   ```

### Splash screen

1. Create a 2732×2732 PNG with your logo centered on a dark background (`#0f172a`)
2. In Xcode: select the `App` target → **Assets.xcassets** → add a new Image Set named `Splash`
3. Drop the PNG in the 1× slot

---

## Step 4 — Open in Xcode

```bash
npm run cap:open:ios
# or directly:
npx cap open ios
```

This opens `ios/App/App.xcworkspace` in Xcode.

---

## Step 5 — Configure the App in Xcode

In Xcode, select the `App` project in the left panel → `App` target → **General** tab:

| Field | Value |
|---|---|
| Bundle Identifier | `com.stackbargains.app` |
| Version | `1.0` |
| Build | `1` |
| Display Name | `Stack Bargains` |
| Deployment Target | iOS 16.0 |

Switch to the **Signing & Capabilities** tab:
- Check **Automatically manage signing**
- Team: select your Apple Developer account

---

## Step 6 — Test on Your iPhone (Optional but Recommended)

1. Plug your iPhone into the Mac with a USB cable
2. In Xcode, select your device from the device dropdown (top center bar)
3. Press **▶ Run** (Cmd+R)
4. The app will install on your phone — test it fully

---

## Step 7 — Archive for App Store

1. In Xcode, set the destination to **Any iOS Device (arm64)** (not a simulator)
2. Menu: **Product → Archive**
3. Wait ~2–5 minutes for the build
4. The Organizer window opens automatically when done

---

## Step 8 — Submit to App Store Connect

In the Organizer:
1. Select the archive → click **Distribute App**
2. Choose **App Store Connect** → **Upload**
3. Keep all defaults checked → **Upload**
4. Wait ~15–30 min for processing

### App Store Connect setup (if first time)

Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com):

1. **My Apps** → **+** → **New App**
   - Platform: iOS
   - Name: `Stack Bargains`
   - Bundle ID: `com.stackbargains.app`
   - SKU: `stackbargains-ios-001`

2. Fill in the **App Information**:
   - Category: **Business**
   - Subtitle: `Whatnot Sales Tracker`

3. Under **1.0 Prepare for Submission**:
   - Upload screenshots (at least iPhone 6.5" = iPhone 14 Plus size)
   - Write description, keywords, support URL
   - Select your uploaded build from the Build section

4. Click **Submit for Review**

Apple review takes **1–3 business days** for a first submission.

---

## Step 9 — App Store Screenshots

You need screenshots at these sizes (minimum):

| Device | Screen size |
|---|---|
| iPhone 14 Plus / 15 Plus | 6.5" (required) |
| iPhone 14 Pro Max / 15 Pro Max | 6.7" (required) |
| iPad Pro 12.9" | Optional but recommended |

Easiest method: run the app in Xcode Simulator at those device sizes, use **Cmd+S** to save screenshots.

---

## Updates After Going Live

Every time you push changes to Railway, the app automatically shows the latest version — no App Store update needed (because it loads your live URL).

You only need to submit a new App Store build if you change:
- The app icon or splash screen
- Native Capacitor plugins
- The app name or bundle ID
- iOS deployment target

For those changes, bump the **Build** number in Xcode (e.g., 1 → 2), archive again, and upload.

---

## Troubleshooting

**"No accounts with App Store Connect access"** — Sign in to Xcode with your Apple ID:
Xcode → Settings → Accounts → + → Apple ID

**"Could not find module '@capacitor/ios'"** — Run `npm install` then `npx cap sync` again

**White screen in app** — Check that your Railway URL is correct and the site is live

**App rejected by Apple** — Common reason for tracker/business apps: add a Privacy Policy URL in App Store Connect (you can use a simple Google Docs page)
