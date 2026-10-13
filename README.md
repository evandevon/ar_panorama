# 360° QR Experience Maker

A free, sign-in-free website hosted on GitHub Pages. An **author** pastes a link to a 360° photo, places videos and sounds around it, previews it, and prints a QR code. A **viewer** scans the code and looks around on their phone, either by moving the phone or by dragging with a finger.

There's no server or database. Everything about an experience lives inside the QR code's link.

## Pages

| Page | Who uses it |
|---|---|
| `make.html` | Authors. Paste links, preview with the mouse, set the starting view, then copy, print, save or embed the QR code. |
| `index.html` | Viewers. This is what QR codes open: the site's main address. Visiting it without a code shows a pointer to the maker. |
| `view.html` | Only forwards older links to the main address. Keep it so earlier QR codes keep working. |

## Put it online

1. Create a **public** GitHub repository.
2. Upload everything in this folder, keeping the folders as they are. Include the hidden `.nojekyll` file.
3. Go to **Settings → Pages** and set the source to **Deploy from a branch** → `main` → `/ (root)`.
4. After a minute or two the site is at `https://<username>.github.io/<repo>/`.

Make QR codes from `https://<username>.github.io/<repo>/make.html` on GitHub Pages. Codes made from a copy on your own computer won't open on phones, and the page warns you if you try.

## For authors

**360° photo.** You can paste any of these:
- a Google Drive share link
- a Dropbox share link
- a OneDrive share link
- a direct link to a JPEG

Set sharing to **Anyone with the link**. The photo should be equirectangular (2:1), which is what 360 cameras and phone "photo sphere" modes export. About **4096 × 2048** and under 3 MB loads quickly on school Wi-Fi.

**360° video instead of a photo.** Paste a link to an equirectangular (2:1) 360 video file (MP4, WebM or MOV) in step 1. Everything else works on top of it, including spots, corner pinning, look-to-reveal dots and Line up with the real room.
- The video loops, and starts when the viewer taps to begin.
- With spots, the toolbar's **Sound** button mutes everything, the video included.
- The video's own sound drops to a quarter while a video spot plays.
- **Hosting:** use this GitHub repo (under 100 MB per file). Google Drive doesn't reliably allow its videos to be used this way, and its links don't show that they're videos.
- **A classroom-friendly file:** H.264 MP4, 2880 × 1440 (or 1920 × 960 for older phones), about 5–8 Mbps, 1–2 minutes long, which comes to roughly 40–90 MB. Many phones can't play 360 video wider than 4096 px, and the author page warns about that. Remember that a whole class loading a video at once is heavy on school Wi-Fi.
- **YouTube 360 videos can't be used as the background.** Browsers don't let a page use the picture inside a YouTube player, and YouTube doesn't allow anything drawn over its player. If it's your own video, download the original from YouTube Studio and host the file.

**Starting view.** Drag the preview so the important thing is in front of you, then press **Start from this view**.

The preview loads the photo exactly the way a phone will. If it shows a green tick, the QR code will work.

### Spots

Spots place videos, sounds, pictures, text, links and 3D models around the room. You can add up to 8.

| Kind | What to put in |
|---|---|
| Video | A YouTube link, or an MP4 / WebM / MOV file |
| Sound | An MP3, M4A, AAC, OGG, Opus, WAV or FLAC file, or a YouTube video's sound |
| Picture | A PNG, JPEG, GIF (animated GIFs play), WebP, AVIF, SVG or BMP file |
| Text | Just type the words (line breaks are kept). The label becomes its heading. Viewers can tap it to read it full screen. |
| 3D model | A `.glb` file (best), or `.gltf`, `.obj` or `.stl`. See **3D models** below. |
| Link | A web page address. It shows as a button that opens the page in a new tab; the label is the button text. Only ordinary `https://` addresses are allowed. |

Pick a spot's kind with **Type**. It's set automatically when the link ends in a file type, but Google Drive and OneDrive links don't show the file type, so choose it yourself for those. HEIC photos from iPhones and TIFFs won't display in most phone browsers; save them as JPEG or PNG first.

1. Turn the preview so the **crosshair** is where you want the spot.
2. Press **+ Add a spot at the crosshair** and paste the link.
3. In the preview, **drag a video or picture to move it** and **pull its corner tags to resize it**. Sound markers can be dragged too. Dragging the 360 picture itself turns the view.
4. Use **▶ Test** on a video in the preview to play it there. **Show me** turns the preview to a spot, and clicking a spot in the preview highlights its settings.

**Pin corners** (videos, pictures, text and links): tick it, and the four corner tags stop resizing and move one at a time instead. Drag each corner onto the matching point in the photo, such as the corners of a picture frame, a window or the blackboard. The spot is warped to fit, so it looks painted onto the wall and keeps its perspective as viewers look around. Dragging the middle still moves the whole thing, and unticking turns it back into a flat rectangle.
- Pinned pictures stretch to fill their corners exactly.
- A pinned YouTube poster straightens into the normal flat player while it plays, because YouTube's player can't be skewed, and goes back to its pinned shape afterwards. MP4 videos stay pinned while playing.
- Each pinned spot adds about 25–35 characters to the QR code's link.

Use **📱 Phone** view when sizing videos. A phone held upright sees much less of the room than a wide screen, so a video that looks small in Wide view can fill a phone.

| Option | What it does |
|---|---|
| **Plays when the viewer taps it** | Videos show a poster with a play button. Sounds show a speaker marker to tap. |
| **Plays automatically when the viewer looks at it** | Plays while the centre of the screen (the crosshair) is on the video, and pauses as soon as it moves off. For sounds, the centre needs to be within about 12° of the marker. Viewers see a small dot in the centre of the screen so they know where they're aiming. |
| **Plays automatically as soon as it opens** | Starts when the viewer taps to enter. |
| **Sound only** | No picture, just a speaker marker. MP3 links are always sound only. |
| **Hidden** | Nothing shows; it just plays. Only available with one of the automatic options. In the preview, hidden spots appear faintly so you can still move them. |
| **Loop** | Starts again when it ends. |
| **Appears: straight away** | The spot is in the room from the start. |
| **Appears: after the viewer rests the crosshair on a dot** | Only a small pulsing dot shows. While the crosshair stays on it, a ring fills over 1.5 seconds; when it's full, the spot appears, and videos and sounds start playing. Tapping the dot works too. This works for every kind of spot. |
| **Pictures: Shows all the time** | The picture sits in the room. Viewers can tap it to see it full screen, which is handy for old letters, posters or maps. |
| **Pictures: Shows only while the viewer looks at it** | The picture fades in while the crosshair is on it and fades out when it moves off. |

Pictures keep their own shape. Transparent PNG, GIF and WebP images show the room through the see-through parts, so cut-out objects look like they're really there. Picture links don't need any special sharing permission beyond "Anyone with the link", so most hosts work.

**Background sound:** add an MP3 spot and set it to *Sound only*, *Hidden*, *Plays as soon as it opens* and *Loop*. While any video plays, sound-only spots drop to a quarter of their volume. Viewers can mute everything with the **Sound** button.

Video sizes are stored as an angle (for example, "20° wide"), so a video stays the same size in the room on every screen.

**YouTube spots start small.** A YouTube spot sits in the room as a poster (the video's thumbnail) at the size you chose. When it starts playing it grows smoothly into the player, and 1.5 seconds after it stops it shrinks back to the poster. It needs to grow because YouTube's player can't be smaller than 356 × 200 pixels while it's showing. Video files (MP4 and others) have no minimum, so they play at exactly the size you set.

**Two things to know about YouTube spots:**

- **YouTube's rules.** YouTube's terms say its player must stay visible: at least 200 × 200 pixels, with nothing covering it. Videos in the room follow this. Sound-only and hidden YouTube spots don't. Use an MP3 for those where you can; the author page warns you when needed.
- **Autoplay on phones.** Phones, especially iPhones, often block sound that doesn't start from a tap. If an automatic YouTube spot is blocked, it plays muted with a **Tap for sound** button. MP3 and MP4 spots are unlocked during the viewer's first tap, so they're more reliable for automatic sound.

### 3D models

A 3D model sits in the room as a real object: as viewers look around, they see it from the matching angle, and it's lit like a solid thing rather than a flat picture. Viewers can **tap it to look at it up close**, turning it over with a finger (or mouse/arrow keys) and pinching or scrolling to zoom.

**Formats:** `.glb` is best: one file with colours and textures included. Tinkercad, SketchUp, Blender and Sketchfab downloads can all export it. `.stl` files (3D-printing files from Tinkercad or Thingiverse) work too but have no colours, so they show in a plain stone colour; they're turned upright automatically. `.obj` works but loses its colours unless they're baked in. `.gltf` files that come with separate texture files won't find them, so export as `.glb` instead.

**Hosting:** put the file in this site's `models/` folder on GitHub (most reliable), or use a Dropbox link. Google Drive and OneDrive don't work for 3D models, because they don't let other sites load the file. Keep files under about 5 MB so they load quickly on phones; the sample inkwell is 23 KB.

**In the author page:**
- **Drag** the model in the preview to move it, and pull a **corner tag** to make it bigger or smaller.
- Drag the **round handle** above it to turn it: sideways turns it around, up and down tilts it. The **Turn**, **Tilt**, **Roll** and **Reset** buttons on its card do the same in 15° steps.
- **Spins slowly** keeps it turning (about 20° a second), which helps viewers notice it's 3D.
- **Shows: all the time / only while looked at** and **Appears: after looking at a dot** work as for pictures.
- **3D model brightness** (step 3, shown once there's a model) lights every model at once. Turn it down for a dim photo and up for a bright one, so the models don't look pasted on.

Models are placed 8 m from the viewer in the direction you choose, and their size is stored as an angle like everything else, so they look the same size on every screen.

### Line up with the real room

Tick **Line up with the real room** (step 3) when viewers will stand in the room where the 360 photo was taken.

**What viewers see:**
- The start screen offers **📷 Line up with this room**.
- Their camera shows the room with your photo faded over it. A **Then ⟷ Now** slider changes the mix.
- They turn the phone until the photo overlaps the room, then slide left or right to fine-tune. They can pinch if the photo looks bigger or smaller than the room.
- The page checks the match a few times a second. It shows **✓ Looks lined up**, or **Nearly — about 12° out** with a **Snap** button that turns the photo the rest of the way.
- They tap **Lined up ✓** (or **Skip**), the camera switches off, and the experience begins. The spots now sit on the real walls.
- The toolbar's **Line up** button lets them redo it later, for example if things drift after a few minutes.

**How the check works:** the phone's motion sensors already know which way is up, so only the left–right turn is unknown. The page compares the outlines (edges) in the camera picture with the same view of your photo at a range of turns, up to 30° either way. It only reports a match when one turn clearly beats the rest, so a room that doesn't match never shows "lined up". Nothing from the camera is saved or sent anywhere.

**It works best when:**
- the photo was taken from where viewers stand (by the QR code is ideal), at about phone height;
- the room still has the same fixed features (doors, windows, ceiling lines, the blackboard wall), even if the furniture has changed;
- the room isn't full of people standing between the viewer and the walls.

Viewers can always skip it or line things up by eye, and it isn't offered on computers or phones without a camera or motion sensors.

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

## Embedding in another website

Press **Embed** on the author page for a ready-to-paste `<iframe>` code, at 400, 500 or 650 px tall, or 16:9 filling the width. It works in Google Sites (**Insert → Embed → Embed code**), WordPress, Wix, Squarespace, Canvas and Moodle. SharePoint only allows embeds from sites an administrator has approved.

When the viewer finds itself inside another site:
- It uses a more compact start card.
- It adds an **Open full screen ↗** link and a **Full screen** toolbar button, which open the same experience in its own tab.
- It doesn't offer **Line up with this room**.

Dragging, sound, video, text, links and look-to-reveal dots all work inside an embed. Moving the phone to look around usually works on Android, but iPhones often block motion sensors (and always the camera) inside another site, so iPhone users should use **Open full screen**.

## Link format

`?p=<photo>&t=<title>&y=<start direction°>&al=1&mb=<model brightness>&s=<spot>&s=<spot>…&v=2`

Each spot is written as `link~yaw~pitch~flags~label~width°~corners~turn`. Text spots use `t:` followed by the text instead of a link. Corners (only for pinned spots) are eight whole-degree offsets from the centre: top-left, top-right, bottom-right, bottom-left, each as yaw,pitch. Turn (only for 3D models) is `turn,tilt,roll` in whole degrees. `mb` is only included when it isn't 1 (normal). The flags are `l` (plays/shows when looked at), `s` (plays at start), `h` (hidden), `r` (loop), `d` (appears after the dot), `o` (3D model spins), and `a` / `v` / `i` / `k` / `m` (sound / video / picture / link / 3D model), used when the kind can't be told from the link.

**The format is safe for email and chat.** It uses only characters that email, chat and document apps keep inside a clickable link. Inside each field, `% ~ | ! * ' ( )` and line breaks are escaped. Links always end with `v=2`, so a full stop or bracket at the end of a label can't be mistaken for the end of the sentence.

**Short codes** keep the link and QR code smaller:

| Code | Stands for |
|---|---|
| `yt:ID` (`yt:ID.65` = start at 65 s) | a YouTube video |
| `gd:ID` | a Google Drive file |
| `wp:` | `https://en.wikipedia.org/wiki/` |
| `db:` | `https://www.dropbox.com/` |
| `od:` | `https://1drv.ms/` |
| `gx:` | `https://docs.google.com/` |
| `w:` | `https://www.` |
| `h:` | `https://` |
| `folder/file.ext` | a file on this site |

Once a code is used in a printed QR code it must keep its meaning forever. New codes can be added, but existing ones must never change.

**Older links** (made before the change to `~`, using `|` between fields and `view.html` in the address) are still read correctly.
