# 360° QR Experience Maker

**The site: https://evandevon.github.io/ar_panorama/**

| I want to… | Go to |
|---|---|
| Make a tour | https://evandevon.github.io/ar_panorama/make.html |
| Turn green-screen video into a see-through video | https://evandevon.github.io/ar_panorama/videomaker.html |
| Test how detailed a QR code my phones can read | https://evandevon.github.io/ar_panorama/qr-test.html |

Make a 360° "tour" in your browser: choose a 360° photo, place videos, sounds, pictures, text and 3D models around the room, and print a QR code. Anyone who scans the code looks around the room on their phone, by moving the phone or dragging with a finger.

It's free, there's nothing to sign in to, and nothing is uploaded: the whole tour lives inside the QR code's link.

**Contents**
- [Make your first tour](#make-your-first-tour)
- [Pick your room](#pick-your-room)
- [Add things to the room](#add-things-to-the-room)
- [Settings](#settings)
- [Try it and share it](#try-it-and-share-it)
- [What viewers see](#what-viewers-see)
- [See-through videos](#see-through-videos)
- [Where to keep your files](#where-to-keep-your-files)
- [Handy extras](#handy-extras)
- [If something doesn't work](#if-something-doesnt-work)
- [Technical reference](#technical-reference)

---

## Make your first tour

1. Open the **[tour maker](https://evandevon.github.io/ar_panorama/make.html)**. It asks you to **pick your room** (a 360° photo). Paste a link to yours, choose one your teacher has put in the class library, or press **Try a sample room**.
2. Type a name for the tour at the top.
3. Turn the room until the **+** is where you want something, then press a tile on the right: **Picture**, **Video**, **Sound**, **Words**, **3D model**, **Link** or **Document**. Paste its link (or type the words), then press **Done**.
4. Press **Try it** to see the tour the way a phone will.
5. Press **Share** to print the QR code or copy the link. Scan it with a phone to check it.

The maker is made for computers, and works a bit like Tinkercad: the room is in the middle, the tiles for adding things are on the right, and choosing a thing shows its settings in the same place. Tours are made to be looked at on phones.

**The classic maker** (everything on one long page, the way the maker used to look) is still there: **[make-classic.html](https://evandevon.github.io/ar_panorama/make-classic.html)**, or **Settings → Open this tour in the classic maker**. Tours open in both.

---

## Pick your room

The room is the 360° photo people look around in. Press **Room** at the top to change it. Paste a link to the photo, or pick one of the **Rooms from your teacher**. Any of these links work:
- a file in this website's GitHub folder (most reliable)
- a Google Drive or Dropbox share link, shared as **Anyone with the link**
- a direct link to a JPEG

**The best photo:** the 2:1 shape that 360° cameras and phone "photo sphere" modes make, about **4096 × 2048**, under 3 MB. That loads quickly on school Wi-Fi.

**Starting view:** drag the preview so the important thing is in front, then press **Start from this view**.

**A 360° video instead:** paste a link to a 360° video file (MP4, WebM or MOV). It loops, and starts when the viewer taps to begin. Everything else works on top of it.
- Good settings for classrooms: MP4, 2880 × 1440 (1920 × 960 for older phones), 1–2 minutes, about 40–90 MB. Remember a whole class loading a video at once is heavy on school Wi-Fi.
- Keep it in the GitHub folder (under 100 MB), or Google Drive (choose **Type → Video**).
- YouTube 360° videos can't be used as the background (YouTube doesn't allow it). If it's your own video, download the original from YouTube Studio.

**Keep working on a tour:** paste a tour's link (from **Copy link**) into **Keep working on a tour** and everything comes back, ready to change.

**Compare two photos:** under the photo, add a second 360° photo (for example, the same room 100 years ago). Viewers drag a bar across the screen to wipe between the two. You can turn the second photo to line it up, and give each side a name.

---

## Add things to the room

### What you can add

| Add a… | Paste this |
|---|---|
| **Picture** | A PNG, JPEG, GIF (animated GIFs play), WebP or SVG. See-through PNGs show the room through the clear parts. |
| **Video** | A YouTube link, or an MP4, WebM or MOV file |
| **Sound** | An MP3, M4A, WAV, OGG or similar file, or a YouTube video (just its sound) |
| **Text** | Just type the words. The label becomes its heading. |
| **Link** | A web page address. It becomes a button that opens the page in a new tab. Use it to link to another tour, too. |
| **3D model** | A `.glb` file (best), or `.stl`, `.obj` or `.gltf`. See [3D models](#3d-models). |
| **Document** | A PDF, Word, PowerPoint or Excel file, or a Google Doc, Slides or Sheet. Viewers tap it to read it full screen. See [Documents](#documents). |

A tour can have up to 20 things. iPhone photos (HEIC) and TIFFs won't show on most phones: save them as JPEG or PNG first.

### Placing things

1. Turn the room until the **+** (crosshair) is where you want it. The **arrow buttons** round the room turn it too.
2. Press a tile on the right (**Make your own**), or a link your teacher chose (**Class library**). Its settings open, ready for the link.
3. In the room, **drag** it to move it and **pull its corners** to resize it. Or use **Smaller**, **Bigger** and **Move to crosshair** in its settings.
4. Press **Done** (or Esc) to go back to the tiles. Everything you've added is listed under **In your room**: press one to change it.

Handy:
- **📱 Phone** view shows exactly how much a phone held upright can see. Size videos in that view.
- **▶ Test** plays a video in the preview. **Show me** turns the preview to a thing.
- If a link has a problem, a red **!** appears at the end of its box. Point at it (or tap it) to see what's wrong.
- Sizes are saved as angles, so things look the same size on every phone.

### When it plays, and when it appears

| Setting | What happens |
|---|---|
| **Plays when tapped** | Videos show a poster with a play button; sounds show a speaker to tap. |
| **Plays when looked at** | Plays while the dot in the middle of the screen is on it, and pauses when it moves off. |
| **Plays as soon as it opens** | Starts when the viewer taps to begin. |
| **Hidden** | Nothing shows; it just plays (with one of the automatic settings). |
| **Loop** | Starts again when it ends. |
| **Volume** | How loud it plays (0–100). Nothing is turned down automatically. |
| **Appears: straight away** | It's in the room from the start. |
| **Appears: after a delay** | It appears a few seconds after the viewer starts. |
| **Appears: after looking at a dot** | Only a small pulsing dot shows. When the viewer rests the middle of the screen on it (or taps it), the thing appears, and videos and sounds start. It hides again when they look away. |
| **Pictures: shows only while looked at** | The picture fades in while it's looked at. |

**Background sound:** add a **Sound**, set it to *Plays as soon as it opens*, and tick *Hidden* and *Loop*.

**YouTube videos** sit in the room as a small poster, then grow into YouTube's player while they play (YouTube's player has a minimum size). Phones often block sound that doesn't start from a tap, so for sound that plays by itself, an MP3 or MP4 file is more reliable than YouTube.

### Which one is in front

When you choose something in the preview that overlaps something else, small **▲ / ▼** buttons appear beside it: ▲ brings it in front, ▼ sends it behind. (The same buttons are in its card's **Size and place** box.)

Pictures, text and links normally sit in front of 3D models. **Pictures** can go behind a 3D model or see-through video too, for example a mat on a tabletop with a model standing on it: choose the model and press ▲.

### A thing's card

Press a thing under **In your room** (or click it in the room) to open its settings. They're in labelled boxes:
- **When it shows and plays** (blue): when it appears, how it plays, Hidden, Loop and Volume.
- **How it looks** (purple): see-through video, and spinning or flat colours for 3D models.
- **Size and place** (gold): Smaller, Bigger, Move to crosshair, Show me, turning a 3D model, and which one is in front.

Boxes that don't apply to that kind of thing are left out.

**More options** (the dashed box at the bottom) has things most tours never need:
- **Pin corners:** drag each of the four corners onto a point in the photo (the corners of a window or blackboard). It's warped to fit, so it looks painted on the wall.
- **Float on the screen:** stays in one place on the screen instead of in the room, like a sticker.
- **Floor plan** (floating pictures): shows a dot and a cone on your map, pointing the way the viewer faces.
- **Disappear when it ends** (videos): fades away at the end.
- **Hidden by masks:** untick to keep it in front of every mask.

### Masks

Masks let things hide behind parts of the photo, so a person can stand behind the teacher's desk or peek round a door.

1. Open **Masking** and press **Draw a mask**.
2. Click round the edge of the thing that should be in front, dot by dot. Click the first dot (or press **Done**) to finish.

Masks hide pictures, videos, 3D models, text and documents. Buttons, links and dots are never hidden. **Adjust the dots** lets you move a mask's dots later. Masks have straight edges, so they suit furniture, frames and doorways better than hair or plants.

### 3D models

A 3D model sits in the room as a real object, seen from the right angle as viewers look around. Viewers can tap it to turn it over and zoom in.

- **Files:** `.glb` is best (Tinkercad, SketchUp, Blender and Sketchfab can all save it). `.stl` works but has no colours. Keep files under about 5 MB.
- **From Tinkercad:** if colours come out wrong, group the parts and turn on **Multicolor** before exporting.
- **Where to keep it:** the GitHub folder's `models/` folder, Dropbox, or Google Drive (set **Type → 3D model**). Not OneDrive.
- **On its card:** drag the round handle to turn it, or use **Turn**, **Tilt** and **Roll**. **Spins slowly** keeps it turning. **Bright, flat colours** shows Tinkercad colours as you picked them.
- **Brightness of all 3D models** (under the list) makes models match a dim or bright photo.

### Documents

| Where the file is | What to paste |
|---|---|
| Google Drive, Docs, Slides or Sheets | Its share link (shared as **Anyone with the link**) |
| Personal OneDrive | In OneDrive choose **Share → Embed** and paste the code it gives you |
| School OneDrive / SharePoint | Its share link, only if your school allows sharing outside it (test in a private window) |
| A PDF or Office file in the GitHub folder or Dropbox | Its link |

Press **⤢ Open** on it in the preview to see what viewers will see.

### Class link library

A teacher can put every link a class might use in one **Google Sheet**, so pupils choose from a list instead of pasting long links. QR codes stay small too: each chosen link is just a number like `#3` in the tour.

1. Make a Google Sheet with these four columns, in this order: **Number | Type | Name | Link**. (In the maker, **Copy the heading row** copies the headings, ready to paste into cell A1.) Put one link per row. Any link that works elsewhere in the maker works here, including Google Drive.
2. **Type** is one of: **image**, **video**, **sound**, **3D**, **link**, **document** or **room** (a capital first letter is fine). The link then only shows on that kind of card. **room** is for 360° photos: they show in **Pick your room** as **Rooms from your teacher**. Leave Type empty to show a link on every card.
3. Share the sheet as **Anyone with the link → Viewer**.
4. In the maker, press **Settings**, open **Class link library** and paste the sheet's address. (A CSV file works too, such as `links/example.csv` in the GitHub folder, or its GitHub page's address.)
5. Press **Check every link**. Each one is opened and marked ✓ OK, ⚠ Check, ✗ Problem, or ? (web pages: open them to look).
6. Press **Copy a maker link for pupils** and give them that link. They get a **Class library** tab beside the tiles, with your links as buttons (filtered by type), and each thing's settings has **Choose from the class link library**.

Good to know:
- Once a pupil opens your maker link, every tour they make carries your sheet in its link. When they come back with **Keep working on a tour**, the Class library is still there, even if they haven't used it yet.
- Fixing a link in the sheet fixes every tour that uses it, even printed ones.
- Never change or reuse a row's number once tours use it.
- If the sheet is deleted or unshared, those things go missing from tours.
- For a see-through video, use type **video**; the pupil ticks **See-through video** on the card.

---

## Settings

Press **Settings** at the top. (The tour's name is typed at the top of the maker, and shows at the top of the tour.)

- **Line up with the real room:** for tours used in the room where the photo was taken. Viewers' cameras show the real room with your photo over it, and they turn until the two match, so everything sits on the real walls. It works best when the photo was taken where viewers stand.
- **Keep sounds playing when the screen is off:** for listening tours. Viewers scan the code, lock their phone and keep listening as they walk, with pause and play on the lock screen. Otherwise sounds pause when the screen goes off and carry on when it comes back. (Phones always pause videos.)

---
- **For teachers:** the [class link library](#class-link-library), and a link to the classic maker.

---

## Try it and share it

**Try it** shows the real tour in a phone-shaped frame: drag to look around and click things to play them. Close it to go back to making.

**Share** shows the QR code with a big **Print it** button, **Copy link** and **Save picture**. **More ways to share** has Open, Embed, a short link, merging and the whole link. Keep the link (**Copy link**) if you want to change the tour later.

**How big to print it:** every thing you add makes the QR code more detailed. The maker tells you when to print it bigger:

| QR code | Print it at least |
|---|---|
| Simple (up to 65 squares across) | any size |
| Detailed (up to 97) | 6 cm wide |
| Crowded (up to 117) | 8 cm wide |
| Very crowded | 10 cm wide |

**Make the QR code simpler:**
- **Short link:** under **More ways to share**, open *Make the QR code simpler*. Copy the link, shorten it with TinyURL (or similar) and paste the short link in. The QR code is then made from it. If you change the tour afterwards, make a new short link.
- **Export merged photosphere:** paints pictures, text and 3D models that sit still into the 360° photo itself, so the link doesn't need to carry them. Keep the "editable version" link it gives you, because merged things can't be moved any more.
- **Class link library:** links chosen from a library are just a number each.

**Embed:** **Embed** gives a code for Google Sites, WordPress, Canvas, Moodle and others. iPhones often block motion inside another website, so embedded tours show an **Open full screen** button.

---

## What viewers see

1. They scan the code and tap **Start**. On iPhones they tap **Allow** for motion.
2. They look around by moving the phone. The **Motion** switch (top right) changes to dragging with a finger instead.
3. The bottom bar has:
   - **Recentre:** back to the starting view.
   - **Start again:** every video and sound back to the beginning, without reloading.
   - **Pause / Resume:** stops every video and sound where it is.
   - **Sound on / off:** mutes everything.
4. **Scan** (top right) opens the camera inside the tour to scan the next QR code. Another tour on this site opens straight away.

On computers, they drag with the mouse and scroll to zoom. Tapping a picture or text card shows it full screen. Link buttons open their page in a new tab.

---

## See-through videos

A see-through video shows a person or object standing in the room, with the room visible around them, like a weather presenter in front of a map. It plays on every phone, iPhones included.

1. **Film** the person in front of a plain green or blue screen.
2. Open the **[See-through Video Maker](https://evandevon.github.io/ar_panorama/videomaker.html)** (in Chrome or Edge on a Windows or Mac computer).
3. **Choose the video.** Press the colour box (eyedropper) and click the green, or press **Pick it for me**.
4. **Adjust the sliders** under the preview until the background has gone. Drag the dots at each end of the timeline to trim it.
5. Press **Make**, download the file, and press **Try it in a room** to check it.
6. Upload it to the GitHub folder's `videos` folder (or Google Drive), add a **Video** to your tour, and make sure **See-through video** is ticked. (It ticks itself when the file name says "see-through".)

**Messy green screen?** Press **Show the fixes**:
- **Draw a shape** round the person to remove everything outside it, or round a part that won't go away (*Remove inside*), or round a part that keeps vanishing, like a green jumper (*Keep inside*).
- **Add another background colour** for shadows and creases.
- **Use this moment as the empty background**: film a second with nobody in it first, then use that moment. This works best of all for creased or uneven screens.
- **Tidy the edges** removes outlines, specks and small holes. **Stencil** view shows them clearly.

The Video Maker can also make a **WebM with transparency** (for other apps and websites; not iPhones) and an **animated GIF**. Nothing is uploaded: it all happens on your computer. **Undo** and **Redo** step back through your changes.

---

## Where to keep your files

| Where | 360° photo | Videos and sounds | Documents | 3D models |
|---|---|---|---|---|
| This website's GitHub folder | ✅ Always | ✅ Always | ✅ | ✅ |
| Google Drive | ✅ Usually | ✅ | ✅ | ✅ |
| Dropbox | ✅ Usually | ✅ Usually | ✅ | ✅ Usually |
| Personal OneDrive | ❌ Rarely | ❌ Rarely | ✅ with **Share → Embed** | ❌ |
| School OneDrive | ❌ Usually blocked | ❌ Usually blocked | ⚠️ Only if outside sharing is allowed | ❌ |
| YouTube | ❌ | ✅ If the owner allows embedding | — | — |

**GitHub files:** you can paste a file's GitHub page link (`github.com/…/blob/…`). It's turned into the file itself, and a file in this site's own folder shrinks to just its path, like `models/inkwell.glb`.

**Google Drive tips:**
- Share every file as **Anyone with the link → Viewer**.
- Drive links don't say what kind of file they are, so choose the **Type** on the card.
- Keep videos under about 20 MB so they're quick on phones. They download when the tour opens (a "Downloading 40%" label shows meanwhile).
- If a file is shared so anyone can **edit** it, the maker warns you, because anyone with the tour could change or delete it. Change it to **Viewer**.
- Google limits how often one file can be downloaded in a day. For a big group (a whole school at an event), keep files in the GitHub folder instead, or use Export merged photosphere.

**Pupils' photos and videos:** the GitHub folder is public, so anyone could find files there. Google Drive (shared by link only) keeps them less discoverable.

---

## Handy extras

- **[QR code size tester](https://evandevon.github.io/ar_panorama/qr-test.html):** slide to make test QR codes from simple to the most detailed, then scan them from the screen, or press **Copy picture**, paste into PowerPoint and print, to find your phones' limits. Each code opens a test tour titled with its size.
- **Finding out why a tour is slow:** add `&stats=1` to the end of a tour's link and open it on the slow phone. A panel shows what's taking the time, with switches to hide 3D models, masks, pictures or videos to see which one makes the difference. **Copy these stats** copies it all.

---

## If something doesn't work

- **The photo or a file won't load:** check it's shared as **Anyone with the link**. Try keeping it in the GitHub folder instead.
- **A Google Drive video or model stopped loading:** Google may have hit its daily download limit for that file. Try again tomorrow, or keep it in the GitHub folder.
- **Sound doesn't start by itself on iPhones:** use an MP3 or MP4 file rather than YouTube.
- **Moving the phone doesn't look around:** tap **Allow** when asked. If it was refused, close the tab and scan again. In an embedded tour, use **Open full screen**.
- **The camera won't start** (for Scan or Line up): close the Camera app and video calls, then try again. A QR scanner's built-in browser often can't use the camera: open the link in Safari or Chrome.
- **The maker still looks old after an update:** refresh with Ctrl+Shift+R.
- **QR codes made from a copy on your computer don't work:** always make them from the site's address above.

---

## Technical reference

### The pages

| File | What it is |
|---|---|
| `make.html` | The tour maker ("style A": room in the middle, tiles on the right) |
| `make-classic.html` | The previous tour maker, kept as a backup (everything on one page) |
| `index.html` | The tour viewer: what QR codes open (the site's main address) |
| `videomaker.html` | The See-through Video Maker |
| `merge.html` | Export merged photosphere (opened from the maker) |
| `qr-test.html` | The QR code size tester |
| `view.html` | Forwards older links to the main address. Keep it, so old QR codes keep working. |
| `links/example.csv` | An example class link library |

Working on the code? Start with `DEVELOPER-NOTES.md`.

### Putting the site online (or moving it)

1. Create a **public** GitHub repository and upload everything, keeping the folders as they are (include the hidden `.nojekyll` file).
2. **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**.
3. After a minute or two the site is at `https://<username>.github.io/<repo>/`.

### The Google Drive key

The site's Google Drive key is in `js/settings.js`. It's what lets Drive videos, sounds and 3D models download, lets the maker check Drive sharing, and is a fallback for class link libraries. It only works on `https://evandevon.github.io/*`, so Drive downloads fail when testing on your own computer. Without a key, Drive sounds and videos show as Google's own small player, and can't play by themselves, loop or be hidden.

To make a new key (if the site moves):
1. Use a Google account with **no payment card**.
2. In Google Cloud, enable the **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. **API restrictions:** only **Google Drive API**. **Application restrictions:** **Websites**, `https://YOURNAME.github.io/*`.
5. Put the key in `js/settings.js`.

The key can be seen in the site's code; those two restrictions keep it safe, and with no billing nothing can ever be charged. The worst case is that someone uses up the day's free allowance.

### Why some hosts fail

Browsers only let a page draw a photo in 3D if the photo's host allows it, and cloud drives decide that themselves (and change their rules without notice). Plain video and sound playback is more forgiving, and documents use the host's own viewer. Since late 2024, personal OneDrive doesn't let other websites fetch files.

YouTube's rules say its player must stay visible (at least 200 × 200 pixels, not covered). When a tour uses YouTube for sound only, viewers see a small YouTube player in the corner while it plays. Some YouTube videos can't be played on other websites at all, and school networks that block YouTube block the sound too.

### Link format

`?p=<photo>&t=<title>&y=<start direction°>&s=<thing>&s=<thing>…&f=<mask>&f=<mask>…&v=2`

Other tour settings: `al=1` (line up with the real room), `bg=1` (keep sounds playing with the screen off), `mb=` (3D model brightness, when not 1), `p2` / `y2` / `n1` / `n2` (compare photospheres: second photo, its turn in degrees, and the names for the main and second photo), `lib=` (a class link library: a Google Sheet id, or a file's address), and `stats=1` (the stats panel; never put in QR codes).

Each thing (`s=`) is: `link~yaw~pitch~flags~label~width°~corners~turn~delay~plan~layer~volume`
- **link:** the file or page; `t:` followed by words for text; `#3` for entry 3 of the class link library.
- **width:** in degrees (or a % of the screen when floating). Under 10, it can have one decimal.
- **corners** (pinned): eight whole-degree offsets from the centre, top-left, top-right, bottom-right, bottom-left, each as yaw,pitch.
- **turn** (3D models): `turn,tilt,roll` in whole degrees.
- **delay:** seconds after the viewer starts before it appears.
- **plan** (floor-plan pictures): `across,down,turn`: where the photo was taken on the plan (in %) and the turn that lines the plan up.
- **layer:** −3 to 3; higher sits in front where things overlap (left out when 0).
- **volume:** 0–100 (left out when 100). On iPhones it only works for files in the GitHub folder or Google Drive.

**Flags:** `l` plays or shows when looked at · `s` plays at start · `h` hidden · `r` loop · `d` appears after the dot · `o` 3D model spins · `f` 3D model in flat colours · `x` see-through video · `w` (with `x`) a WebM with its own transparency · `u` not hidden by masks · `e` video fades out at the end · `g` floats on the screen (yaw and pitch are then 0–100 across and down) · `a` / `v` / `i` / `k` / `m` / `p` sound / video / picture / link / 3D model / document, when the kind can't be told from the link.

**Masks (`f=`):** a list of `yaw,pitch` pairs in degrees, to the nearest half degree, e.g. `f=0,15,-20,15,-20,-15,0,-15`. (A mask starting with `w` works the other way round, like a window; the maker doesn't offer it.)

**Safe for email and chat:** inside each field, `% ~ | ! * ' ( )` and line breaks are escaped, and links always end with `v=2`, so a full stop or bracket after a link can't be mistaken for part of it.

**Short codes** keep links shorter:

| Code | Stands for |
|---|---|
| `yt:ID` (`yt:ID.65` = start at 65 s) | a YouTube video |
| `gd:ID` | a Google Drive file |
| `wp:` | `https://en.wikipedia.org/wiki/` |
| `db:` | `https://www.dropbox.com/` |
| `od:` | `https://1drv.ms/` |
| `gx:` | `https://docs.google.com/` |
| `gr:` | `https://raw.githubusercontent.com/` |
| `w:` | `https://www.` |
| `h:` | `https://` |
| `folder/file.ext` | a file on this site |

**Never change what a letter, code or field means.** Printed QR codes depend on them. New ones can be added; existing ones must keep their meaning forever. Older links (with `|` between fields and `view.html` in the address) are still read correctly.

### Limits

- Up to 20 things per tour, and the link must stay under about 8,000 characters (web servers refuse longer addresses).
