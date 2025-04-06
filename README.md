# ChatWeave
Connect to multiple Twitch.tv chats at the same time and consume them as a singular streamlined message feed.

Great for streamers who often play together while interacting with each other's communities!  

Also extremely useful for streamers who may want a clean and light-weight chat experience, as the default Twitch chat experience can be very bloated and spammy.

![chatweave-example](https://github.com/user-attachments/assets/1f310c6c-f3aa-4ff8-9ae1-2b351a0819a1)

Example URL: https://afancyfridgemagnet.github.io/chatweave/?channels=bobross,disguisedtoast,exbc,gamesdonequick,petedorr,skinnedteen,surefour,twitch&ignore=nightbot,pokemoncommunitygame,sery_bot,soundalerts,streamelements,streamlabs&botcommands=false&thirdpartyemotes=true&history=100&prune=0&fresh=60&readonly=false

## Features
- [x] Clean, minimalistic design (gets rid of most chat badges)
- [x] Improved chat readability with large font size and improved color contrast of usernames!
- [x] Sending/Receiving basic chat messages (including support for third-party emote providers!)
- [x] Ability to ignore messages from specific bots or users
- [x] Temporarily muting of channels
- [x] Proper link parsing, and all links will open in a new browser tab
- [x] Scrolling up will preserve message history, allowing you to slowly read through past messages
- [x] Completely client-side!
- [x] Configurable!
- [x] Usable in Stream Overlays!


## Potential Future Features
- [ ] Support highlighted messages / message effects?
- [ ] Support message replies?
- [ ] Support for broadcaster online/offline/raid messages
- [ ] Support for basic moderator commands (timeout, ban, etc)
- [ ] Support for auto-completion of @names for users that have sent a message
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
Clears text box / deselects text box.

`Up Arrow` or `Down Arrow`  
Cycles through message history of previously entered commands/chat messages.


## Basic Commands  
Some commands may allow multiple parameters. These can be separated by a space ( ) or a comma (,).  

Some commands allow partial channel names as a shortcut. In these instances, only the FIRST channel name that contains the entered text will be affected.  

If allowed, a combinations of channel indexes and channel names may be used.  
Example: `/leave 1 dark 5 6 ross`  will leave channels #1, #5, #6, and the first matching channel names that contain "dark" or "ross".  

`/join <channel names>`  
Joins one or more channels.  
Alias: /j

`/leave <partial channel names or numbers>`  
Leaves one or more channels.  
Empty arguments leaves currently active channel.  
Alias: /l, /part

`/channel <partial channel name or number>`  
Sets the active channel that messages will be sent to (indicated by a rectangle around channel name.)  
Alias: /chan, /c  

`/background <partial channel name or number> <hex color>`  
Sets a background hex-color for messages received from specified channel. An 8-digit hex color can be used for transparency.  
See more information about hex-color transparency here: https://gist.github.com/lopspower/03fb1cc0ac9f32ef38f4  
Alias: /bg  

`/solo <partial channel names or numbers>`  
Unmutes one specific channel while muting all other channels.  
Empty arguments solos currently active channel.  

`/mute <partial channel names or numbers>`  
Mutes one or more channels, hiding and preventing messages from showing.  
Empty arguments mutes currently active channel.  

`/unmute <partial channel names or numbers>`  
Unmutes one or more channels, allowing future messages to show.  
Empty arguments unmutes currently active channel.  

`/unmuteall`  
Unmutes all channels, allowing all future messages to be shown.  

`/clear <optional partial channel name(s) or number(s)`  
Clears messages from specified channel(s). If no parameters specified, clears messages from the current active channel.  

`/clearall`  
Clears all messages from the screen.  

`/ignore <user names>`  
Add users to ignore list, preventing messages from being shown. Useful for ignoring known bots.  
Commonly used bot accounts: nightbot pokemoncommunitygame sery_bot soundalerts streamelements streamlabs  

`/unignore <user names>`  
Remove users from ignore list, allowing future messages to be shown.  

`/logout`  
Disconnects from Twitch and invalidates the current access token, effectively logging out completely.  

## Configuration Commands

`/botcommands <true|false>`  
When set to false, messages presumed to be bot commands (generally messages prefixed with a !) will not be shown. May be helpful in reducing message spam.  

`/thirdpartyemotes <true|false>`  
When set to true, parses and displays third-party GLOBAL and CHANNEL emotes from 7TV, BTTV, FFZ.  
 
`/history <# messages>`  
Sets the maximum number of messages to keep on screen. Messages over this limit will be removed. Set to 0 to disable this functionality.  

`/prune <# seconds>`  
Sets the maximum age of messages to keep on screen. Messages older than this will be removed. Set to 0 to disable this functionality.  

`/fresh <# seconds>`  
Messages older than # seconds will be separated with a 'tracker bar' that may help keep track of new messages. Set to 0 to disable this functionality.  

## Extra Commands

`/lurk`  
Sends a message to active channel that states you will be lurking. This mimics Twitch's built-in /lurk command.  

`/me <action>`  
Sends a message to active channel as an action. This mimics Twitch's built-in /me command.

`/shrug <message>`  
Sends a message to active channel with a shrug suffix. This mimics Twitch's built-in /shrug command.


## Using as a Stream Overlay

TODO: OBS setup and customization


## Credits / Contributors

Thanks to all my friends who used, tested, and provided feedback to make this project what it is today.  
(If you're one of them and would like your name and/or Twitch link included here let me know!)  

adiq's tEmotes API (for Third-Party Emotes)  
https://github.com/adiq/temotes 

CrippledByte's emotes-api (for Third-Party Emotes)  
https://github.com/CrippledByte/emotes-api 
