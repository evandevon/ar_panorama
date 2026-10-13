# 360° QR Experience Maker

A free, sign-in-free website hosted on GitHub Pages. An **author** pastes a link to a 360° photo (and optionally some sound), previews it, and prints a QR code. A **viewer** scans the code and looks around on their phone, either by moving the phone or by dragging with a finger.

There's no server or database. Everything about an experience lives inside the QR code's link.

## Pages

| Page | Who uses it |
|---|---|
| `index.html` | Authors. Paste links, preview with the mouse, set the starting view, then copy, print or save the QR code. |
| `view.html` | Viewers. This is what the QR code opens. |

## Put it online

1. Create a **public** GitHub repository.
2. Upload everything in this folder, keeping the folders as they are. Include the hidden `.nojekyll` file.
3. Go to **Settings → Pages** and set the source to **Deploy from a branch** → `main` → `/ (root)`.
4. After a minute or two the site is at `https://<username>.github.io/<repo>/`.

Make QR codes from the GitHub Pages address. Codes made from a copy on your own computer won't open on phones, and the page warns you if you try.

## For authors

**360° photo.** You can paste any of these:
- a Google Drive share link
- a Dropbox share link
- a OneDrive share link
- a direct link to a JPEG

Set sharing to **Anyone with the link**. The photo should be equirectangular (2:1), which is what 360 cameras and phone "photo sphere" modes export. About **4096 × 2048** and under 3 MB loads quickly on school Wi-Fi.

**Sound (optional).** You can paste an MP3 link (from Drive, OneDrive, Dropbox or a direct link) or a YouTube link. Tick *Loop* for background sound; leave it off for narration.

**Starting view.** Drag the preview so the important thing is in front of you, then press **Start from this view**.

The preview loads the photo exactly the way a phone will. If it shows a green tick, the QR code will work.

### Video spots

Video spots pin YouTube videos, or MP3 / MP4 files, to places in the room. You can add up to 8.

1. Turn the preview so the **crosshair** points where you want the spot.
2. Press **+ Add a video spot at the crosshair** and paste the link.
3. Use **Move to crosshair** to reposition a spot later, and **Show me** to turn the preview towards it.

Each spot has these options:

| Option | What it does |
|---|---|
| **Plays when the viewer taps it** | A marker shows: the video's thumbnail, or a speaker for sound. Tapping opens and plays it. |
| **Plays automatically when the viewer looks at it** | Starts when the viewer faces it, within about 20°. Pauses when they turn away, past about 50°. |
| **Plays automatically as soon as it opens** | Starts as soon as the viewer taps to enter. |
| **Sound only** | No picture, just a speaker marker. MP3 links are always sound only. |
| **Hide the marker** | Nothing shows; it just plays. Only available with one of the automatic options. |

Other behaviour:

- While a spot plays, the main background sound drops to a quarter of its volume.
- In the preview, automatic spots start after your first click inside the preview, because browsers need a click before playing sound.

**Two things to know about YouTube spots:**

- **YouTube's rules.** YouTube's terms say its player must stay visible: at least 200 × 200 pixels, with nothing covering it. Visible video spots follow this, since the player is never smaller than 356 × 200. Sound-only and hidden YouTube spots don't follow it. For those, an MP3 is the safe choice, and the author page says so.
- **Autoplay on phones.** Phones, especially iPhones, often block sound that doesn't start from a tap. If an automatic YouTube spot can't start with sound, it plays muted and shows a **Tap for sound** button. For hidden spots, a hint asks the viewer to tap the screen instead. MP3 and MP4 spots are unlocked during the viewer's first tap, so they're more reliable.

### What works where

| Host | 360 photo | Sound |
|---|---|---|
| This GitHub repo (`panoramas/`, `audio/`) | ✅ Always | ✅ Always |
| Google Drive | ✅ Usually | ✅ Usually |
| Dropbox | ✅ Usually | ✅ Usually |
| Personal OneDrive | ⚠️ Sometimes | ⚠️ Usually |
| School/work OneDrive | ❌ Usually blocked | ⚠️ Only if external sharing is allowed |
| YouTube | — | ✅ If the owner allows embedding |

Why some hosts fail: browsers only let a web page draw a photo in 3D if the photo's host allows it. Cloud drives decide this themselves and change their rules without notice. Plain audio playback doesn't need that permission, so sound is more forgiving.

**About YouTube sound.** YouTube's rules require its player to stay visible, at least 200 × 200 pixels and not covered. When an experience uses YouTube sound, viewers see a small YouTube player in the top-left corner while it plays. An MP3 avoids this. Some YouTube videos can't be played on other websites at all; the preview tells you if so. School networks that block YouTube will also block the sound.

## For viewers

- **Move my phone.** Hold the phone up and turn around. iPhones ask for permission; tap **Allow**. You can still drag left and right to adjust.
- **Drag to look.** Use a finger, or a mouse on a computer. Pinch or scroll to zoom.
- Switch modes at any time with the **Move / Drag** buttons. **Recentre** returns to the starting view.
- If motion isn't allowed or the device has no motion sensor, the viewer switches to dragging and says why.
- Keyboard: arrow keys look around, `+`/`-` zoom.

## Link format

`view.html?p=<photo>&a=<sound>&t=<title>&y=<start direction°>&l=1&s=<spot>&s=<spot>…`

Each spot is written as `link|yaw|pitch|flags|label`. The flags are `l` (plays when looked at), `s` (plays at start), `a` (sound only) and `h` (hidden).

Google Drive and YouTube links are stored as short codes (`gd:<id>`, `yt:<id>`) so the QR code stays easy to scan.
