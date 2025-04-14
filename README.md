# ChatWeave (for twitch.tv)
Get Started: https://afancyfridgemagnet.github.io/chatweave/  

Connect to multiple Twitch.tv chats at the same time and consume them as a singular streamlined message feed. 

Great for streamers who often play together while interacting with each other's communities!  

Also for users who may want a clean and light-weight chat experience, as the default Twitch chat experience can be very bloated and spammy.

![wide](https://github.com/user-attachments/assets/84fa1893-8ade-4659-9d22-cf5cc4ccddd4)

<details>
<summary>Visual explanation of features</summary>

![features](https://github.com/user-attachments/assets/4cb7aa1f-039b-4aec-b9c6-513d26187bce)
![chatbar](https://github.com/user-attachments/assets/6e251a2a-61d1-4e57-ac4c-ab0ce5664b7e)
</details>

<details>
<summary>Alternative layout for mobile devices / narrow resolutions!</summary>

![narrow](https://github.com/user-attachments/assets/0355ebe3-17b7-4159-8cd9-73daa1d9c673)
</details>


## Features
- [x] Clean, minimalistic and performant design
- [x] Improved readability with larger font size and improved color contrast
- [x] Send/receive basic chat messages w/ support for third-party emotes
- [x] @username tab-completion for recent chatters
- [x] Ignore messages from specific accounts (such as bots)
- [x] Temporarily mute channels to stop displaying their messages
- [x] Proper link parsing, all links open in a new browser tab
- [x] Scrolling up preserves message history while you catch up
- [x] Completely client-side
- [x] Mobile Support
- [x] Usable as OBS overlay
- [x] Shareable/bookmarkable configuration via URLs!


## Potential Future Features (No promises)
- [ ] Indicator for highlighted messages / message effect redeems
- [ ] Support message replies
- [ ] Broadcaster online/offline/raid messages
- [ ] Basic moderator commands (timeout, ban, etc)
- [ ] Respect Twitch API request limits
- [ ] Allow user choice of permissions (read only, read/send, read/send/mod commands)


# Usage

Authorization will be needed through your Twitch.tv account to send and receive messages.  
By default it will automatically join your Twitch Account's chat channel, but you may /join and /leave channels at your discretion.

Configuration changes will update the page's current URL, which can then be bookmarked for future use, or shared with other people.  


## Keyboard Shortcuts

`# keys`  
Sets active chat channel by channel index.

`Tab` or `Shift + Tab`  
Focuses text box / sets active chat channel by cycling forward (or backwards) through channel list.

`Escape`  
Clears text box / deselects text box if already empty.

`Up Arrow` or `Down Arrow`  
Cycles through history of previously entered commands/chat messages.


## Basic Commands  
Some commands may allow multiple parameters. These can be separated by a space ( ) or a comma (,).  

Some commands allow partial channel names as a shortcut. In these instances, only the FIRST channel name that contains the entered text will be affected.  

If allowed, a combinations of channel indexes and channel names may be used.  
Example: `/leave 1 dark 5 6 ross`  will leave channels #1, #5, #6, and the first matching channel names that contain "dark" or "ross".  

`/join <channel names>`  
Joins one or more channels.  
Background hex color may be specified using syntax: `channel1:color1 channel2:color2`.  
Alias: /j

`/leave <partial channel names/numbers>`  
Leaves one or more channels.  
If no parameters specified, leaves the currently active channel.  
Alias: /l, /part

`/channel <partial channel name/number>`  
Sets the active channel that messages will be sent to (indicated by a rectangle around channel name.)  
Alias: /chan, /c  

`/background <partial channel name/number> <hex color>`  
Sets a background hex-color for messages received from specified channel. An 8-digit hex color can be used for transparency.  
See more information about hex-color transparency here: https://gist.github.com/lopspower/03fb1cc0ac9f32ef38f4  
Alias: /bg  

`/solo <partial channel names/numbers>`  
Unmutes specific channels while muting all other channels.  
If no parameters specified, solos the currently active channel.  

`/mute <partial channel names/numbers>`  
Mutes one or more channels, hiding and preventing messages from showing.  
If no parameters specified, mutes the currently active channel.  

`/unmute <partial channel names/numbers>`  
Unmutes one or more channels, allowing future messages to show.  
If no parameters specified, unmutes the currently active channel.  

`/unmuteall`  
Unmutes all channels, allowing all future messages to be shown.  

`/purge <optional partial channel names/numbers`  
Removes messages from specified channels.  
If no parameters specified, removes messages from the currently active channel.  

`/purgeall`  
Removes all messages from all channels.  

`/ignore <user names>`  
Add users to ignore list, preventing messages from being shown. Useful for ignoring known bots.  
If no parameters specified, lists currently ignored users.  
Common bots: `moobot nightbot pokemoncommunitygame sery_bot soundalerts streamelements streamlabs tangiabot`  

`/unignore <user names>`  
Remove users from ignore list, allowing future messages to be shown.  

`/logout`  
Disconnects from Twitch and invalidates the current access token, effectively logging out of the current session completely.  


## Configuration Commands

`/botcommands <true|false>` (default: true)  
When set to false, messages presumed to be bot commands will not be shown. May be helpful in reducing message spam.  
Bot commands are messages prefixed with "!" such as !giveaway, !pokecheck, !discord, etc.  

`/staticemotes <true|false>` (default: false)  
When set to true, future messages containing emotes/cheermotes will load non-animated versions if available. This can have performance improvements.  
 
`/thirdpartyemotes <true|false>` (default: false)  
When set to true, parses and displays third-party GLOBAL and CHANNEL emotes from 7TV, BTTV, FFZ.  
 
`/nodelete <true|false>` (default: false)  
When set to true, prevents deleted messages from being removed.  
 
`/history <# messages>` (default: 150)  
Sets the maximum number of messages to keep available. Messages over this limit will be removed.  

`/prune <# seconds>` (default: 0)  
Sets the maximum age of messages to keep available. Messages older than this will be removed. Set to 0 to disable this functionality.  

`/fresh <# seconds>` (default: 0)  
Messages older than # seconds will be separated with a 'tracker bar' that may help keep track of new messages. Set to 0 to disable this functionality.  


## Extra Commands

`/lurk`  
Sends a message to active channel that states you will be lurking. This mimics BTTV's /lurk command.  

`/me <action>`  
Sends a message to active channel as an action. This mimics Twitch's /me command.

`/shrug <message>`  
Sends a message to active channel with a shrug suffix. This mimics BTTV's /shrug command.


# Using as an OBS Stream Overlay

Add a new "Browser" source to your scene. Open the properties window for this source.

| Command | Description |
| --- | --- |
| URL | Set to your customized chatweave URL.  Configuration is based on this URL and session changes will not be persisted. Recommended to add `&readonly=true` to the URL to disable bottom chat panel |
| Width / Height | The dimensions of the source.  You should modify the size here instead of scaling it in the preview window to prevent distorted and blurry text! |
| Custom CSS | Used to customize/override the styling of messages.  There is a template below you can use and modify. |
| Shutdown source when not visible | Keep unchecked to stay connected and preserve message history. |
| Refresh browser when scene becomes active | Keep unchecked. |

After adjusting properties click OK to close the window.  
You may have to login to Twitch and/or authorize ChatWeave to your account.  
In order to do this you can right-click your Browser source and select Interact. This will allow you to use your mouse and keyboard to interact with the page directly.   
After logging in/authorizing ChatWeave it should begin working.  

> [!NOTE]
> Twitch access tokens are only good for ~45-60 days. If you see the error "access_token failed validation" or new messages are not appearing, you will need to click the button "Refresh cache of currrent page" in the Browser source's properties.


## Custom CSS template
![overlay](https://github.com/user-attachments/assets/545ca7c2-ead2-41d8-b2a3-92a4df940235)
```CSS
body { 
	margin: 0px auto; 
	/* transparent background */
	background-color: rgba(0, 0, 0, 0); 
	/* hide scrollbar */
	overflow: hidden;  
}

html {
	/* text size - increase number to make larger */
	font-size: 16px;
	/* make text thicker and more legible */
	font-weight: bold;
}

.msg-user {
	/* user name width */
	/* 1rem = 16px (rem scales with font-size) */
	flex-basis: 12rem;
}

/* optionally move channel avatar to right */
.msg-room {
	order: 4;
}

/* hide elements (tracker bar, bottom panel, time column, system messages, badges */
/* optionally add .msg-room to the list to hide channel avatar */
#chatTracker, #chatPanel, .msg-time, .system, .badge {
	display: none !important;
}
```


# Removing ChatWeave
In order to completely disconnect ChatWeave from your Twitch Account you should visit your Settings -> Connections page on Twitch and scroll down to "Other Connections".  
Shortcut: [Twitch Connections](https://www.twitch.tv/settings/connections)  

Find "ChatWeave" and click the Disconnect button.  
![twitch-connections](https://github.com/user-attachments/assets/bcd6f844-ae78-41cc-82fb-58044b1e2169)


# Credits / Contributors

Thanks to all those who tested and provided feedback to make this project as good as it is today.  

adiq's tEmotes API (for Third-Party Emotes)  
https://github.com/adiq/temotes 

CrippledByte's emotes-api (for Third-Party Emotes)  
https://github.com/CrippledByte/emotes-api 
