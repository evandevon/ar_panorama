# 360° QR Experience Maker

A free, sign-in-free website hosted on GitHub Pages. An **author** pastes a link to a 360° photo, places videos and sounds around it, previews it, and prints a QR code. A **viewer** scans the code and looks around on their phone, either by moving the phone or by dragging with a finger.

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

**Starting view.** Drag the preview so the important thing is in front of you, then press **Start from this view**.

The preview loads the photo exactly the way a phone will. If it shows a green tick, the QR code will work.

### Video, Audio and Picture Spots

Spots place YouTube videos, video files, sounds and pictures around the room. You can add up to 8.

| Kind | Links that work |
|---|---|
| Video | YouTube, or MP4 / WebM / MOV files |
| Sound | MP3, M4A, AAC, OGG, Opus, WAV or FLAC files, or a YouTube video's sound |
| Picture | PNG, JPEG, GIF (animated GIFs play), WebP, AVIF, SVG or BMP |

Pick a spot's kind with **Type**. It's set automatically when the link ends in a file type, but Google Drive and OneDrive links don't show the file type, so choose it yourself for those. HEIC photos from iPhones and TIFFs won't display in most phone browsers; save them as JPEG or PNG first.

1. Turn the preview so the **crosshair** is where you want the spot.
2. Press **+ Add a spot at the crosshair** and paste the link.
3. In the preview, **drag a video or picture to move it** and **pull its corner tags to resize it**. Sound markers can be dragged too. Dragging the 360 picture itself turns the view.
4. Use **▶ Test** on a video in the preview to play it there. **Show me** turns the preview to a spot, and clicking a spot in the preview highlights its settings.

Use **📱 Phone** view when sizing videos. A phone held upright sees much less of the room than a wide screen, so a video that looks small in Wide view can fill a phone.

| Option | What it does |
|---|---|
| **Plays when the viewer taps it** | Videos show YouTube's own poster and play button. Sounds show a speaker marker to tap. |
| **Plays automatically when the viewer looks at it** | Plays while the centre of the screen (the crosshair) is on the video, and pauses as soon as it moves off. For sounds, the centre needs to be within about 12° of the marker. Viewers see a small dot in the centre of the screen so they know where they're aiming. |
| **Plays automatically as soon as it opens** | Starts when the viewer taps to enter. |
| **Sound only** | No picture, just a speaker marker. MP3 links are always sound only. |
| **Hidden** | Nothing shows; it just plays. Only available with one of the automatic options. In the preview, hidden spots appear faintly so you can still move them. |
| **Loop** | Starts again when it ends. |
| **Pictures: Shows all the time** | The picture sits in the room. Viewers can tap it to see it full screen, which is handy for old letters, posters or maps. |
| **Pictures: Shows only while the viewer looks at it** | The picture fades in while the crosshair is on it and fades out when it moves off. |

Pictures keep their own shape. Transparent PNG, GIF and WebP images show the room through the see-through parts, so cut-out objects look like they're really there. Picture links don't need any special sharing permission beyond "Anyone with the link", so most hosts work.

**Background sound:** add an MP3 spot and set it to *Sound only*, *Hidden*, *Plays as soon as it opens* and *Loop*. While any video plays, sound-only spots drop to a quarter of their volume. Viewers can mute everything with the **Sound** button.

Video sizes are stored as an angle (for example, "40° wide"), so a video stays the same size in the room on every screen. YouTube videos never shrink below 356 × 200 pixels, which is YouTube's minimum player size.

**Two things to know about YouTube spots:**

- **YouTube's rules.** YouTube's terms say its player must stay visible: at least 200 × 200 pixels, with nothing covering it. Videos in the room follow this. Sound-only and hidden YouTube spots don't. Use an MP3 for those where you can; the author page warns you when needed.
- **Autoplay on phones.** Phones, especially iPhones, often block sound that doesn't start from a tap. If an automatic YouTube spot is blocked, it plays muted with a **Tap for sound** button. MP3 and MP4 spots are unlocked during the viewer's first tap, so they're more reliable for automatic sound.

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

`view.html?p=<photo>&t=<title>&y=<start direction°>&s=<spot>&s=<spot>…`

Each spot is written as `link|yaw|pitch|flags|label|width°`. The flags are `l` (plays/shows when looked at), `s` (plays at start), `h` (hidden), `r` (loop), and `a` / `v` / `i` (sound / video / picture), used when the kind can't be told from the link.

Links from older versions that use `a=` for background sound still work, and the author page turns that sound into a hidden spot.

Google Drive and YouTube links are stored as short codes (`gd:<id>`, `yt:<id>`) so the QR code stays easy to scan.
