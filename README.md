# chatweave
Connect to multiple Twitch.tv chats at the same time and consume them as a singular streamlined message feed.

Great for streamers who often play together while interacting with each other's communities!  

Also extremely useful for streamers who may want a clean and light-weight chat experience, as the default Twitch chat experience can be very bloated and spammy.

# Usage

Authorization will be needed through your Twitch.tv account to send and receive messages.  
By default it will automatically join your Twitch Account's chat channel, but you may /join and /leave channels at your discretion.

Configuration changes will update the page's current URL, which can then be bookmarked for future use, or shared with other people.

## Potential Future Features
- [ ] Support highlighted messages / message effects?
- [ ] Support for broadcaster online/offline/raid messages
- [ ] Support for basic moderator commands (timeout, ban, etc)
- [ ] Support for auto-completion of @names for users that have sent a message
- [ ] Respect Twitch API request limits
- [ ] Allow user choice of permissions (read only, read/send, read/send/mod commands)


## Basic Commands

`/join <channel names>`  
Joins one or more channels.  
Alias: /j

`/leave <partial channel names or numbers>`  
Leaves one or more channels.  
Alias: /l, /part

`/channel <partial channel name or number>`  
Sets the active channel that messages will be sent to (indicated by a rectangle around channel name.)  
Alias: /chan, /c  

`/background <partial channel name or number> <hex color>`  
Sets a background hex-color for messages received from specified channel. An 8-digit hex color can be used for transparency.  
See more information about hex-color transparency here: https://gist.github.com/lopspower/03fb1cc0ac9f32ef38f4  
Alias: /bg  

`/solo <partial channel name or number>`  
Unmutes one specific channel while muting all other channels.  

`/mute <partial channel names or numbers>`  
Mutes one or more channels, hiding and preventing messages from showing.  

`/unmute <partial channel names or numbers>`  
Unmutes one or more channels, allowing future messages to show.  

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
Uses adiq's tEmotes API: https://github.com/adiq/temotes  
 
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
