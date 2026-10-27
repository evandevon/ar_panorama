# 360° QR Experience Maker

A free, sign-in-free website hosted on GitHub Pages. An **author** pastes a link to a 360° photo, places videos and sounds around it, previews it, and prints a QR code. A **viewer** scans the code and looks around on their phone, either by moving the phone or by dragging with a finger.

There's no server or database. Everything about an experience lives inside the QR code's link.

## Pages

| Page | Who uses it |
|---|---|
| `make.html` | Authors. Paste links, preview with the mouse, set the starting view, then copy, print, save or embed the QR code. |
| `index.html` | Viewers. This is what QR codes open: the site's main address. Visiting it without a code shows a pointer to the maker. |
| `videomaker.html` | Authors. The See-through Video Maker turns green-screen footage into see-through videos for tours (also transparent WebM and GIF). |
| `merge.html` | Authors, from the maker's **Export merged photosphere…** button. Paints still spots into the 360° photo so the QR code gets simpler. |
| `view.html` | Only forwards older links to the main address. Keep it so earlier QR codes keep working. |

Working on the code? Start with `DEVELOPER-NOTES.md`.

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
- **Hosting:** use this GitHub repo (under 100 MB per file), or Google Drive (shared as Anyone with the link; choose **Type → Video**, since Drive links don't show that they're videos).
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
| Document | A PDF, Word, PowerPoint or Excel file, or a Google Doc, Slides or Sheet. It sits in the room as a card; viewers tap it to read it full screen, with **Open in new tab** as a backup. See **Documents** below. |
| Link | A web page address. It shows as a button that opens the page in a new tab; the label is the button text. Only ordinary `https://` addresses are allowed. |

**Overlapping spots:** the spot you've chosen (its card is open, and its outline is teal) always sits on top in the preview, so you can drag it and pull its corners even where it overlaps another. Click once more on an overlap (without dragging) to choose the spot underneath. Pointing at a card in the list outlines its spot in the preview, and choosing a card makes its spot pulse.

You choose a spot's kind when you add it; **Type**, at the top of its card, changes it. Settings most spots never need (floating on the screen, pinning corners, floor plans, disappearing at the end, masks) are under **More options** on each card, which says how many are switched on. Cards are named by their label, or else by the file's own name (e.g. *sample-candle.mp4*, *Google Drive video*). If a link has a problem, a red **!** appears at the end of its field: hover over it (or tap it) to see what's wrong and how to fix it. It's set automatically when the link ends in a file type, but Google Drive and OneDrive links don't show the file type, so choose it yourself for those. HEIC photos from iPhones and TIFFs won't display in most phone browsers; save them as JPEG or PNG first.

1. Turn the preview so the **crosshair** is where you want the spot.
   The **arrow buttons around the preview** turn the view too: tap for 15°, or hold to keep turning. They're handy when spots fill the view and dragging keeps grabbing them.
2. Under **Add at the crosshair**, press what you're adding (**Picture**, **Video**, **Sound**, **Text**, **Link**, **3D model** or **Document**). Its card opens, ready for the link (or the words).
3. In the preview, **drag a video or picture to move it** and **pull its corner tags to resize it**. Sound markers can be dragged too. Dragging the 360 picture itself turns the view.
4. Use **▶ Test** on a video in the preview to play it there. **Show me** turns the preview to a spot, and clicking a spot in the preview highlights its settings.

**Pin corners** (videos, pictures, text and links; under **More options** on the card): tick it, and the four corner tags stop resizing and move one at a time instead. Drag each corner onto the matching point in the photo, such as the corners of a picture frame, a window or the blackboard. The spot is warped to fit, so it looks painted onto the wall and keeps its perspective as viewers look around. Dragging the middle still moves the whole thing, and unticking turns it back into a flat rectangle.
- Pinned pictures stretch to fill their corners exactly.
- A pinned YouTube poster straightens into the normal flat player while it plays, because YouTube's player can't be skewed, and goes back to its pinned shape afterwards. MP4 videos stay pinned while playing.
- Each pinned spot adds about 25–35 characters to the QR code's link.

Use **📱 Phone** view when sizing videos. A phone held upright sees much less of the room than a wide screen, so a video that looks small in Wide view can fill a phone.

| Option | What it does |
|---|---|
| **Plays when the viewer taps it** | Videos show a poster with a play button. Sounds show a speaker marker to tap. |
| **Plays automatically when the viewer looks at it** | Plays while the centre of the screen (the crosshair) is on the video at the size you set, and pauses as soon as it moves off, however the video was started. (A YouTube player grows while it plays, but only your original size counts.) For sounds, the centre needs to be within about 12° of the marker. Viewers always see a small dot in the centre of the screen so they know where they're aiming. |
| **Plays automatically as soon as it opens** | Starts when the viewer taps to enter. |
| **Sound only** | No picture, just a speaker marker. MP3 links are always sound only. |
| **Hidden** | Nothing shows; it just plays. Only available with one of the automatic options. In the preview, hidden spots appear faintly so you can still move them. |
| **Loop** | Starts again when it ends. |
| **Disappear when it ends** | Videos only (not when looping): the video fades away at the end instead of staying on its last frame. It comes back if it's played again (for example, a video that plays when looked at plays again when the viewer looks away and back). |
| **Appears: straight away** | The spot is in the room from the start. |
| **Appears: after the viewer rests the crosshair on a dot** | Only a small pulsing dot shows. While the crosshair stays on it, a ring fills over 1.5 seconds; when it's full, the spot appears, and videos and sounds start playing. Tapping the dot works too. When the viewer looks away from it again, it goes back behind its dot after a moment (videos and sounds stop), ready to be revealed again. A spot revealed by tapping stays until it's been looked at and then looked away from, or turned out of view. This works for every kind of spot. |
| **Pictures: Shows all the time** | The picture sits in the room. Viewers can tap it to see it full screen, which is handy for old letters, posters or maps. |
| **Pictures: Shows only while the viewer looks at it** | The picture fades in while the crosshair is on it and fades out when it moves off. |

Pictures keep their own shape. Transparent PNG, GIF and WebP images show the room through the see-through parts, so cut-out objects look like they're really there. Picture links don't need any special sharing permission beyond "Anyone with the link", so most hosts work.

**Background sound:** add an MP3 spot and set it to *Sound only*, *Hidden*, *Plays as soon as it opens* and *Loop*. Set how loud it is with its **Volume** slider (nothing is turned down automatically). Viewers can mute everything with the **Sound** button.

Video sizes are stored as an angle (for example, "20° wide"), so a video stays the same size in the room on every screen.

**YouTube spots start small.** A YouTube spot sits in the room as a poster (the video's thumbnail) at the size you chose. When it starts playing it grows smoothly into the player, and 1.5 seconds after it stops it shrinks back to the poster. It needs to grow because YouTube's player can't be smaller than 356 × 200 pixels while it's showing. Video files (MP4 and others) have no minimum, so they play at exactly the size you set.

**Two things to know about YouTube spots:**

- **YouTube's rules.** YouTube's terms say its player must stay visible: at least 200 × 200 pixels, with nothing covering it. Videos in the room follow this. Sound-only and hidden YouTube spots don't. Use an MP3 for those where you can; the author page warns you when needed.
- **Autoplay on phones.** Phones, especially iPhones, often block sound that doesn't start from a tap. If an automatic YouTube spot is blocked, it plays muted with a **Tap for sound** button. MP3 and MP4 spots are unlocked during the viewer's first tap, so they're more reliable for automatic sound.

### Masking

Masks hide parts of spots behind things in the photo, so a person can stand behind the teacher's desk or peek round a door frame.

1. In step 2, open **Masking** and press **Draw a mask**.
2. Turn the preview to the thing that should be in front, and click around its edge dot by dot. Clicks go straight through spots, so dots can go right on top of them; dragging still turns the view. Click the first dot, or press **Done**, to close it.

A mask hides every visual spot behind it: pictures, videos (including YouTube and see-through videos), 3D models, text and documents. Controls are never hidden: sound buttons, links and the dots that reveal things stay on top. To keep a particular spot in front of every mask, untick **Hidden by masks** on it (the box appears on visual spots once there's a mask). The hidden parts can't be tapped, and "plays when looked at" doesn't start while the crosshair is on a mask. 3D models and see-through videos are covered by a cut-out copy of the photo, so the edge is invisible.

### Which one is in front where things overlap

When you choose a spot in the preview and it overlaps another, small **▲ / ▼** buttons appear on the right edge of its box: ▲ brings it in front of what it overlaps, ▼ sends it behind. The same thing is in the spot's **More options** (*Where it overlaps: ▼ Further back / ▲ Further forward*), for keyboard users. The order is kept in the link.

It sorts like with like: pictures, text cards, links and ordinary videos are drawn by the web page, which always sits in front of the 3D scene, so they can be ordered among themselves; 3D models and see-through videos are ordered among themselves (for example, a see-through video of a pupil standing in front of or behind a 3D model). Pictures, text and links are normally in front of 3D models. The exception is a **pinned picture** (Pin corners): it can go behind an overlapping 3D model or see-through video — for example, a mat pinned onto a tabletop with a 3D model standing on it. Choose the model and press ▲ (or choose the picture and press ▼). The picture is then drawn into the 3D scene, so it looks the same, but the model stands in front of it. This needs the picture's host to allow it: GitHub and Dropbox do, and Google Drive pictures are downloaded with the site's key if needed. If a host refuses, the maker says so and the picture stays in front.

Use **Adjust the dots** to drag a mask's dots in the preview. Untick **Use the masks in the preview** to move spots that are hidden behind one. Masks are saved in the link as compass positions, so there's no extra file to make or upload. They have straight-edged outlines, so they suit furniture, frames and doorways better than hair or plants. Viewers stand at the centre of the photo, so this is layering, like paper cut-outs, rather than real depth.

### See-through videos

A see-through video shows a person or object standing in the room, with the room visible around them (like a weather presenter in front of a map). It plays on every phone, including iPhones.

1. Film the person or object in front of a plain **green or blue screen**.
2. Open the **See-through Video Maker** (`videomaker.html` on your site). Choose the video, press the colour box (it has an eyedropper) and click the green background in the preview, or press **Pick it for me**. It also finds paler shades of the same screen, so patchy lighting is handled. Then adjust the sliders right under the preview until the background has gone: **Remove more or less**, **Keep the person solid** (if the person looks a little see-through), **Edge detail** (crisp edges, or softer ones that keep wisps of hair and glows) and **Soften the edges**. To trim it, drag the dots at each end of the timeline. **Undo** and **Redo** (or Ctrl+Z and Ctrl+Shift+Z) step back through your changes, and each slider has a ↺ button to put it back. Choose the file type, size and sound, check the summary of what will be made, then press **Make** and download the file. It plays straight away in a sample classroom (**Try it in a room**), so you can check it before uploading. It's made on your own computer; nothing is uploaded. Use Chrome or Edge on a Windows or Mac computer, so the file comes out as an MP4 that iPhones can play.
3. Upload the file to your site's `videos` folder, add a video spot with its path (for example `videos/teacher.see-through.mp4`), and make sure **See-through video** is ticked (it ticks itself for file names containing "see-through").

**Rough or home-made green screens.** Step 2, *Fix problems* (press **Show the fixes**), rescues footage from creased sheets, patchy lighting and screens that are too small:

- **Draw a shape:** click dot by dot around an area in the preview, then click the first dot (or press Done) to close it. Drag a dot to adjust it later.
  - *Remove outside*: draw roughly around the person and everything outside the shape becomes see-through (it's shaded on the preview). Use it for a screen that doesn't fill the picture, or for stands, edges of the room and other clutter around the outside.
  - *Remove inside* is for a stand, crease or shadow that won't go.
  - *Keep inside* is for parts of the person that vanish, like a green jumper or a shiny badge (it keeps their filmed colour).
  - Shapes stay in one place, so they suit someone standing still. Dots clicked near the picture's edge snap onto it.
- **Add another background colour:** click a shadow, crease or dark corner that's still showing.
- **Use this moment as the empty background:** if the video has a moment with nobody in it (film a second or two before the person steps in), go to it and press this. The tool then knows exactly what the screen looks like at every spot, which handles creases and uneven light best. The camera must stay still.
- **Tidy the edges:** *Shrink the edges* trims a leftover outline, *Remove specks* clears floating bits of background, and *Fill small holes* fills see-through spots inside the person. Choose **Stencil** under the preview to see holes and specks clearly (white = solid, black = see-through).

**Other file types.** Step 3 of the Video Maker can also make:

- **WebM with transparency:** a truly see-through video for other apps and websites. It's see-through in Chrome, Edge and Firefox and on Android, but iPhones and iPads can't play it. Make it in Chrome or Edge; the maker checks the finished file still has its transparency, and writes the video's length into it (browser-made WebMs otherwise leave it out, which breaks seeking in some apps).
- **Animated GIF:** no sound, at most 480 wide, 10 or 15 pictures a second. Every pixel is either solid or see-through, so soft edges become crisp. Keep it to a few seconds, or it gets big.

**Using a transparent WebM in a tour.** Paste its path into a video spot. "See-through video" ticks itself (from a name containing "transparent" or "alpha", or by looking inside the file), with **WebM with its own transparency** chosen. The tour draws it into the room like the see-through MP4. iPhones and iPads can't play WebMs like this, so for a tour every phone can use, open the WebM in the Video Maker (it notices it's already see-through) and make the see-through MP4.

**How it works:** the file is an ordinary MP4, twice as tall as the picture: the picture (on black) on top, and a black-and-white "stencil" underneath (white = solid, black = see-through, grey = partly). The tour cuts the picture out with the stencil as it plays, and draws it into the room. Opened on its own, the file looks strange; that's normal. See-through videos can be kept in your GitHub site, Dropbox or Google Drive (shared as Anyone with the link; YouTube can't be used), and can play when tapped, when looked at, or straight away, with Loop.

The sample tour includes a see-through candle (`videos/sample-candle.mp4`).

### 3D models

A 3D model sits in the room as a real object: as viewers look around, they see it from the matching angle, and it's lit like a solid thing rather than a flat picture. Viewers can **tap it to look at it up close**, turning it over with a finger (or mouse/arrow keys) and pinching or scrolling to zoom.

**Formats:** `.glb` is best: one file with colours and textures included. Tinkercad, SketchUp, Blender and Sketchfab downloads can all export it. **Tinkercad `.glb` files:** Tinkercad's exporter has a few known problems, so colours can look washed out or dull, and parts made with a Shape Generator or a group can lose their colour or shift other parts' colours. To avoid that, group those parts and turn on **Multicolor** before exporting. The brightness slider helps with models that look dull. `.stl` files (3D-printing files from Tinkercad or Thingiverse) work too but have no colours, so they show in a plain stone colour; they're turned upright automatically. `.obj` works but loses its colours unless they're baked in. `.gltf` files that come with separate texture files won't find them, so export as `.glb` instead.

**Hosting:** put the file in this site's `models/` folder on GitHub (most reliable), or use a Dropbox link. You can paste the GitHub page link for a file (`github.com/…/blob/…`): it's converted to the file itself automatically, and a file in this site's own repo shrinks to just its path, e.g. `models/inkwell.glb`. Google Drive works too (thanks to the site's Drive key): share the file as **Anyone with the link**, paste its link and set **Type** to **3D model**; it's downloaded when the tour opens. OneDrive doesn't work for 3D models, because it doesn't let other sites load the file. Keep files under about 5 MB so they load quickly on phones; the sample inkwell is 23 KB.

**In the author page:**
- **Drag** the model in the preview to move it, and pull a **corner tag** to make it bigger or smaller.
- Drag the **round handle** above it to turn it: sideways turns it around, up and down tilts it. The **Turn**, **Tilt**, **Roll** and **Reset** buttons on its card do the same in 15° steps.
- **Bright, flat colours** shows the colours exactly as you picked them, on matte plastic, the way Tinkercad shows them. Without it, the file's own materials are used, which for Tinkercad files look paler and slightly metallic. Try both in the preview and keep whichever looks right.
- **Spins slowly** keeps it turning (about 20° a second), which helps viewers notice it's 3D.
- **Shows: all the time / only while looked at** and **Appears: after looking at a dot** work as for pictures.
- **Brightness of all 3D models** (under the spot list in step 2, shown once there's a model) lights every model at once. Turn it down for a dim photo and up for a bright one, so the models don't look pasted on.

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

**If the camera won't start**, viewers get a short explanation and steps for their phone, with **Try again**, **Switch camera** and **Look around without the camera** buttons:
- *Being used by another app* (the most common): close the Camera app, video calls and QR-scanner tabs, then Try again.
- *Not allowed*: steps to turn the camera permission back on in Safari or Chrome.
- *No camera found* or *no picture after a few seconds*: Switch camera, or close other camera apps.
- *This browser can't use the camera* (often a QR scanner's or social app's built-in browser): **Copy link** and open it in Safari or Chrome.

While lining up, a camera button next to Skip switches between the phone's cameras.

### Documents

Paste a link to the document and **Type** becomes **Document** by itself (for Google Drive links, choose it). How it's shown depends on where the file is:

| Where the file is | Shown with |
|---|---|
| Google Drive, Google Docs / Slides / Sheets | Google's own viewer (share as **Anyone with the link**). The card shows a picture of the first page. |
| Personal OneDrive | OneDrive's own viewer: in OneDrive choose **Share → Embed** (or right-click → **Embed**) and paste the code it gives you. A normal OneDrive share link can't be shown. |
| School or work OneDrive / SharePoint | Its own viewer, but only if your school allows sharing with people outside it. Test in a private browser window. |
| A PDF on this site, Dropbox or GitHub | The built-in PDF reader (pages with zoom buttons). |
| Word / PowerPoint / Excel on this site, Dropbox or GitHub | Microsoft's free Office viewer (the file must be reachable on the internet). |

Use **⤢ Open** on the card in the preview to see exactly what viewers will see.

### Export merged photosphere

Every spot makes the QR code longer. When it gets crowded, the maker suggests **Export merged photosphere…** (beside Copy, Print and the rest; it's there whenever a spot can be merged):

| Squares across | About this many characters | What the maker says |
|---|---|---|
| up to 65 | 300 | nothing |
| 66–97 | 650 | print it at least 6 cm wide |
| 98–117 | 1,000 | getting crowded: print 8 cm wide, and suggests merging (with how much shorter it would get) |
| over 117 | more | very crowded: print 10 cm wide; **Print** asks first, offering to make it smaller |
| too long | over 2,300 | no code at all: suggests merging |

The merge page paints the spots that sit still (pictures, text cards and 3D models that are always there) into the 360° photo itself. They look exactly as they do in the tour when looked at straight on (at an angle they look like real flat posters on the wall). Masks still hide what they hid. Things that need tapping, playing or revealing (videos, sounds, links, documents, spots that are looked-at, delayed, floating, spinning or have a floor plan) stay as spots.

1. **Choose what to merge.** Pictures and models start ticked. Text cards start unticked, because merged text can't be read aloud by screen readers or opened full screen. It shows how big the QR code is now and will be.
2. **Make the merged photo**, then download it (a JPEG the photo's own size, up to 8192 wide, tagged as a 360° photo). Put it in Google Drive (Anyone with the link) or the GitHub site.
3. **Paste its link** and open the tour maker: the photo is swapped and the merged spots are gone. Masks stay only if something left can still hide behind them.

Merged spots can't be moved or changed. Keep the **editable version's link** (the page offers it); the maker also remembers it in that browser, and shows *"This photo has spots merged into it…"* with a link back. Pictures must be readable by the page (this site, Google Drive, Dropbox). Text cards need Chrome or Edge. With compare photospheres, merged spots only show on the main photo.

### What works where

**Sounds and videos on Google Drive.** This site has a Google Drive key (in `js/settings.js`), so Drive sounds and videos (see-through ones included) are downloaded whole when the tour opens, then play like any other file: by themselves, when looked at, looping, hidden or see-through. A small "Downloading 40%" label shows on the spot meanwhile. Share each file as **Anyone with the link**, and keep it small (under about 20 MB) so it's quick on phones. The key only works on this website (evandevon.github.io), so Drive downloads fail when testing on your own computer.

Without a key (for example, if the site is copied to another address and `driveKey` is left empty), Google won't let other websites play Drive files, so a Drive sound or video sits in the room as Google's own small player, and viewers tap play in it. Then it can't play when looked at, play by itself, loop, be hidden or be muted with the Sound button.

**Files anyone can edit.** If a Google Drive file in your tour is shared as **Anyone with the link → Editor**, the maker warns you, because anyone who opens the tour could find the link and change or delete the file. Fix it in Drive (**Share → General access → Viewer**) and press **Check again**, or choose **I meant it** to keep it editable (you won't be asked about that file again on this computer).

**Making the key** (only if the site moves, or the key needs replacing): use a Google account with no payment card. In Google Cloud, enable the **Google Drive API**, then **APIs & Services → Credentials → Create credentials → API key**. Under **API restrictions** choose only **Google Drive API**; under **Application restrictions** choose **Websites** and add `https://YOURNAME.github.io/*`. Put the key in `js/settings.js`. The key can be seen in the site's code; those two locks are what keep it safe, and with no billing nothing can ever be charged. The worst case is that someone uses up the day's free allowance, and Drive videos stop loading until the next day.

| Host | 360 photo | Sound and video spots | Documents | 3D models |
|---|---|---|---|---|
| This GitHub repo | ✅ Always | ✅ Always | ✅ | ✅ |
| Google Drive | ✅ Usually | ✅ Downloaded with the site's key (Google's own player without one) | ✅ | ✅ With the site's key |
| Dropbox | ✅ Usually | ✅ Usually | ✅ | ✅ Usually |
| Personal OneDrive | ❌ Rarely | ❌ Rarely | ✅ with **Share → Embed** | ❌ |
| School/work OneDrive | ❌ Usually blocked | ❌ Usually blocked | ⚠️ Only if outside sharing is allowed | ❌ |
| YouTube | — | ✅ If the owner allows embedding | — | — |

Why some hosts fail: browsers only let a web page draw a photo in 3D if the photo's host allows it. Cloud drives decide this themselves and change their rules without notice. Plain sound and video playback doesn't need that permission, so it's more forgiving; documents are shown with the host's own viewer, which needs none. Since late 2024 personal OneDrive no longer lets other sites fetch files directly.

**About YouTube sound.** YouTube's rules require its player to stay visible, at least 200 × 200 pixels and not covered. When an experience uses YouTube sound, viewers see a small YouTube player in the top-left corner while it plays. An MP3 avoids this. Some YouTube videos can't be played on other websites at all; the preview tells you if so. School networks that block YouTube will also block the sound.

## For viewers

- **One tap to start.** Tap **Start**, or anywhere on the start screen. On phones, moving the phone then looks around straight away. iPhones ask for permission first; tap **Allow**. The tap is needed because phones only allow motion sensors and sound to start from a tap.
- **Motion switch** (top right): turn it off to drag with a finger instead, and on again to go back to moving the phone. With motion on, you can still drag left and right to adjust.
- On computers, and phones without a motion sensor, it starts with dragging (mouse or finger). Pinch or scroll to zoom.
- **Recentre** returns to the starting view.
- If motion isn't allowed or the device has no motion sensor, the viewer switches to dragging and says why.
- Keyboard: arrow keys look around, `+`/`-` zoom.
- **Links** are buttons with a pointing-hand icon and a soft white glow, so they stand out from text cards, which can't be followed.

## Tracking down a slow tour

Add `&stats=1` to the end of a tour's link and open it on the phone that's slow. A small panel shows how smooth it is (frames a second), where each frame's time goes (spots, masks, 3D drawing), what's being drawn (draw calls, triangles), the photo's size and the biggest picture that phone can draw, the screen's pixels, and every spot (each model's triangles and file size, each picture's size, and how it's drawn). Switches hide 3D models, masks, pictures and cards, or videos, so you can see which one makes the difference. **Copy these stats** copies it all, to paste into a message. The maker never puts `stats` in QR codes.

## Embedding in another website

Press **Embed** on the author page for a ready-to-paste `<iframe>` code, at 400, 500 or 650 px tall, or 16:9 filling the width. It works in Google Sites (**Insert → Embed → Embed code**), WordPress, Wix, Squarespace, Canvas and Moodle. SharePoint only allows embeds from sites an administrator has approved.

When the viewer finds itself inside another site:
- It uses a more compact start card.
- It adds an **Open full screen ↗** link and a **Full screen** toolbar button, which open the same experience in its own tab.
- It doesn't offer **Line up with this room**.

Dragging, sound, video, text, links and look-to-reveal dots all work inside an embed. Moving the phone to look around usually works on Android, but iPhones often block motion sensors (and always the camera) inside another site, so iPhone users should use **Open full screen**.

## Link format

`?p=<photo>&t=<title>&y=<start direction°>&al=1&mb=<model brightness>&s=<spot>&s=<spot>…&f=<shape>&f=<shape>…&v=2`

Each spot is written as `link~yaw~pitch~flags~label~width°~corners~turn~delay~plan~layer~volume`. Delay (optional) is how many seconds after the viewer starts the spot appears. Plan (pictures only) makes it a floor plan: `across,down,turn` = where the photo was taken on the picture (in %) and the turn (in degrees) that lines the plan up with the photo; viewers see a dot and a cone showing which way they're facing. Layer (optional, −3 to 3, left out when 0) is the order where spots overlap: higher sits in front of lower. Volume (sounds and videos only, 0–100, left out when 100) is how loud it plays; on iPhones and iPads it only works for files kept in your GitHub site or Google Drive (a phone's own volume buttons still apply). Text spots use `t:` followed by the text instead of a link. Corners (only for pinned spots) are eight whole-degree offsets from the centre: top-left, top-right, bottom-right, bottom-left, each as yaw,pitch. Turn (only for 3D models) is `turn,tilt,roll` in whole degrees. `mb` is only included when it isn't 1 (normal). The flags are `l` (plays/shows when looked at), `s` (plays at start), `h` (hidden), `r` (loop), `d` (appears after the dot), `o` (3D model spins), `f` (3D model in bright, flat colours), `x` (see-through video), `w` (with `x`: a WebM with its own transparency rather than a stencil MP4), `u` (masks don't hide this spot), `e` (a video fades out over a second when it ends), `g` (floats on the screen: yaw and pitch are then 0–100 across and down the screen, and width is a % of the screen's shorter side), and `a` / `v` / `i` / `k` / `m` / `p` (sound / video / picture / link / 3D model / document), used when the kind can't be told from the link.

**Compare photospheres** (called "then and now" in older notes) adds `p2` (a second 360 photo), and optionally `y2` (its turn in degrees, to line it up), `n1` and `n2` (names shown beside the bar for the main photo, on the right, and the second photo, on the left). Viewers drag a bar to wipe between the two photos.

Each mask (`f=`) is a list of `yaw,pitch` pairs in degrees, to the nearest half degree, for example `f=0,15,-20,15,-20,-15,0,-15`. (The viewer also understands a mask starting with `w`, which works the other way round, like a window: everything except inside it hides spots. The maker doesn't offer it.)

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
| `gr:` | `https://raw.githubusercontent.com/` (GitHub files from another repo) |
| `w:` | `https://www.` |
| `h:` | `https://` |
| `folder/file.ext` | a file on this site |

Once a code is used in a printed QR code it must keep its meaning forever. New codes can be added, but existing ones must never change.

**Older links** (made before the change to `~`, using `|` between fields and `view.html` in the address) are still read correctly.
