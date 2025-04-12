'use strict';

const pageTitle = document.title;
const pageUrl = new URL(window.location);

const client_id = 'wn3aialkujugjbtcdmtshv1vpv8m9x';
const client_scope = 'user:read:chat user:write:chat';
const redirect_uri = pageUrl.protocol + '//' + pageUrl.host + pageUrl.pathname;
const access_token = twitchAccessToken();

const chatTemplate = document.querySelector('#chatMessage');
const chatOutput = document.querySelector('#chatOutput');
const chatTracker = document.querySelector('#chatTracker');
const chatPanel = document.querySelector('#chatPanel');
const chatRooms = document.querySelector('#chatRooms');
const chatInput = document.querySelector('#chatInput');
const chatCommands = document.querySelector('#chatCommands');

const cleanName = (s) => s?.trim().replace(/^(@|#)/,'').toLowerCase();
const cleanHex = (s) => s?.trim().replace(/^#/,'').toLowerCase();
const isValidTwitchAccount = (s) => s && /^[a-zA-Z0-9_]{4,25}$/.test(s);
const isValidHexColor = (s) => s && /^#?([a-fA-F0-9]{8}|[a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(s);
const isValidUrl = (s) => s && /^((\w+:\/\/)[-a-zA-Z0-9:@;?&=\/%\+\.\*!'\(\),\$_\{\}\^~\[\]`#|]+)$/.test(s);
const isBotCommand = (s) => s && /^!{1}[a-zA-Z0-9]+/.test(s);

const userState = {};				// state properties
const roomState = new Map();		// name -> state properties
const MAX_CHANNEL_LIMIT = 100;		// twitch limit

const colorCache = new Map();		// hex -> adjusted hsl
const cheermoteCache = new Map();	// prefix id -> { tier, color, url }
const emoteCache = new Map();		// 'source id' -> emote
const commandHistory = [];
const MAX_COMMAND_HISTORY = 25;
const MAX_MESSAGE_LENGTH = 500;		// twitch limit

const ignoredUsers = new Set(
	pageUrl.searchParams.get('ignore')?.split(',').map(cleanName).filter(isValidTwitchAccount)
);

let botCommands = (pageUrl.searchParams.get('botcommands') ?? 'true') === 'true';
let staticEmotes = (pageUrl.searchParams.get('staticemotes') ?? 'false') === 'true';
let thirdPartyEmotes = (pageUrl.searchParams.get('thirdpartyemotes') ?? 'false') === 'true';
let messageHistory = parseInt(pageUrl.searchParams.get('history') ?? 150);
let pruneMessageTime = parseInt(pageUrl.searchParams.get('prune') ?? 0) * 1000; // ms
let freshMessageTime = parseInt(pageUrl.searchParams.get('fresh') ?? 60) * 1000; // ms

window.addEventListener('resize', scrollToBottom);

document.addEventListener('DOMContentLoaded', async () => {
	window.twitch = new twitchApi(client_id, access_token);

	const validateToken = async () => {
		const result = await twitch.validateToken();

		// ensure token is only saved in one location
		deleteConfig('access_token');

		if (result && result.client_id === client_id && result.expires_in > 0) {
			console.info('access_token expiration', result.expires_in);
			setConfig('access_token', access_token);

			// save user state
			userState.expires_in = result['expires_in']; // seconds
			userState.id = result['user_id'];
			userState.login = result['login'];
			userState.scopes = result['scopes'];

			// verify token has all the required scopes
			const scopes_verified = client_scope.split(' ').every(s => userState.scopes?.includes(s));
			if (!scopes_verified) {
				console.warn('scope mismatch', client_scope, userState.scopes);
				twitchAuthorizeRedirect();
				throw 'redirecting...';
			}

			// check again in an hour
			const nextCheck = Math.min(userState.expires_in * 1_000, 3_600_000);
			window.validationTimer = setTimeout(validateToken, nextCheck);
		} else {
			// validation failure
			twitch.disconnect();

			for (const prop of Object.getOwnPropertyNames(userState)) {
				delete userState[prop];
			}

			errorMessage('access_token failed validation (refresh)');

			throw 'access_token failed validation';
		}
	};

	await validateToken();

	// token verified
	const pingRegEx = new RegExp('\\b'+userState.login+'\\b', 'i');
	chatInput.placeholder += ` as ${userState.login}`;
	chatPanel.classList.toggle('hidden',
		!userState.scopes.includes('user:write:chat') || pageUrl.searchParams.get('readonly') === 'true'
	);

	// initalized
	twitch.connect();

	twitch.addEventListener('connected', () => {
		const timestamp = new Date((Math.floor(Date.now() / 1000) + userState.expires_in) * 1000);
		noticeMessage(`connection established (access_token expires ${timestamp})`);
	});

	twitch.addEventListener('disconnected', (e) => {
		clearTimeout(window.validationTimer);
		clearInterval(window.intervalTimer);
		chatOutput.innerHTML = '';
		chatRooms.innerHTML = '';
		chatInput.value = '';
		chatInput.readOnly = true;
		chatInput.disabled = true;
		refreshCommands();

		if (e.detail.wasClean) {
			noticeMessage(`disconnected (${e.detail.code})`);
		} else {
			errorMessage(`connection terminated (${e.detail.code})`);
		}
	});

	twitch.addEventListener('error', () => {
		errorMessage('unknown connection error');
	});

	twitch.addEventListener('welcome', () => {
		chatInput.readOnly = false;
		chatInput.disabled = false;

		loadTwitchCheermotes();
		loadThirdPartyGlobalEmotes();

		// TODO: prioritize live channels with twitch.getStreams(users)

		// parse channel list from URL
		// if empty, default to self
		const channels = parseChannelString(pageUrl.searchParams.get('channels')) ?? [{ name: userState.login, color: undefined }];
		joinChannels(...channels);
	});

	twitch.addEventListener('revocation', async ({ detail: msg }) => {
		console.log('revocation', msg.type, msg.id, msg.status);

		const room_state = [...roomState.values()]
			.find(room => room.id === msg.condition.broadcaster_user_id);

		if (!room_state) {
			console.warn('revocation', 'broadcaster_user_id not found', msg.condition.broadcaster_user_id);
			return;
		}

		const subscription_id = room_state.subscriptions.get(msg.type);
		if (!subscription_id || subscription_id !== msg.id) {
			console.warn('revocation', 'subscription_id mismatch', msg.type, msg.id, subscription_id);
			return;
		}

		if (msg.type === 'channel.chat.message') {
			// timedout/banned
			await partChannels(room_state.login);

			// display after leaving so the message isn't removed
			noticeMessage(`kicked from #${room_state.login} (${msg.status})`, {
				roomid: room_state.id,
				source: room_state.login,
				shade: room_state.color,
				avatar: room_state.avatar,
			});
		} else if (room_state.joined) {
			// remove subscription if we're still in channel
			// leaving a channel removes all subscriptions already
			room_state.subscriptions.delete(msg.type);
			await twitch.deleteSubscription(msg.id);
		}
	});

	twitch.addEventListener('stream.online', ({ detail: msg }) => {
		const room_state = roomState(msg.to_broadcaster_user_login);
		if (room_state.muted) return;

		const content = `${msg.broadcaster_user_login} has gone live!`;

		noticeMessage(content, {
			// channel
			roomid: msg.broadcaster_user_id,
			source: msg.broadcaster_user_login,
			shade: room_state.color,
			avatar: room_state.avatar,
			// user
			//userid: msg.broadcaster_user_id,
			//user: msg.broadcaster_user_login,
			//name: msg.broadcaster_user_name,
			// message
			action: true,
			event: true,
		});
	});

	twitch.addEventListener('stream.offline', ({ detail: msg }) => {
		const room_state = roomState(msg.to_broadcaster_user_login);
		if (room_state.muted) return;

		const content = `${msg.broadcaster_user_login} has gone offline!`;

		noticeMessage(content, {
			// channel
			roomid: msg.broadcaster_user_id,
			source: msg.broadcaster_user_login,
			shade: room_state.color,
			avatar: room_state.avatar,
			// user
			//userid: msg.broadcaster_user_id,
			//user: msg.broadcaster_user_login,
			//name: msg.broadcaster_user_name,
			// message
			action: true,
			event: true,
		});
	});

	twitch.addEventListener('channel.raid', ({ detail: msg }) => {
		const room_state = roomState(msg.to_broadcaster_user_login);
		if (room_state.muted) return;

		const viewers = parseInt(msg.viewers).toLocaleString();
		const content = `${msg.from_broadcaster_user_login} is raiding ${msg.to_broadcaster_user_login} with a party of ${viewers}!`;

		noticeMessage(content, {
			// channel
			roomid: msg.to_broadcaster_user_id,
			source: msg.to_broadcaster_user_login,
			shade: room_state.color,
			avatar: room_state.avatar,
			// user
			//userid: msg.from_broadcaster_user_id,
			//user: msg.from_broadcaster_user_login,
			//name: msg.from_broadcaster_user_name,
			// message
			ping: msg.to_broadcaster_user_login === userState.login,
			action: true,
			event: true,
		});
	});

	twitch.addEventListener('channel.chat.clear', ({ detail: msg }) => {
		// remove all channel messages
		const selector = `.msg[data-roomid="${msg.broadcaster_user_id}"]`;
		chatOutput.querySelectorAll(selector)
			.forEach(el => el.remove());
	});

	twitch.addEventListener('channel.chat.clear_user_messages', ({ detail: msg }) => {
		// remove all messages from user
		const selector = `.msg[data-roomid="${msg.broadcaster_user_id}"][data-userid="${msg.target_user_id}"]`;
		chatOutput.querySelectorAll(selector)
			.forEach(el => el.remove());
	});

	twitch.addEventListener('channel.chat.message_delete', ({ detail: msg }) => {
		// remove specific message
		const selector = `.msg[data-roomid="${msg.broadcaster_user_id}"][data-msgid="${msg.message_id}"]`;
		chatOutput.querySelectorAll(selector)
			.forEach(el => el.remove());
	});

	twitch.addEventListener('channel.chat.message', ({ detail: msg }) => {
		// ignored accounts
		if (ignoredUsers.has(msg.chatter_user_login))
			return;

		// ignore "bot commands" starting with !
		if (!botCommands && isBotCommand(msg.message.text))
			return;

		const room_state = roomState.get(msg.broadcaster_user_login);

		if (!room_state || !room_state.joined || room_state.muted)
			return;

		// generate HTML from fragments
		const content = msg.message.fragments.map(frag => {
			switch (frag.type) {
				// TODO: avoid nesting links/imgs and img in span by using an array?
				case 'text': {
					// split sections and process based on content
					return '<span>' + frag.text.split(' ').map(text => {
						// linkify URLs
						if (isValidUrl(text))
							return `<a tabindex="-1" href="${text}">${text}</a>`;

						// third-party emotes
						if (thirdPartyEmotes) {
							// channel emotes
							const chanEmote = emoteCache.get(`${room_state.login} ${text}`);
							if (chanEmote) {
								if (staticEmotes && chanEmote.url_static)
									return `<img class="emote" src="${chanEmote.url_static}" title="${chanEmote.set}: ${text}" alt="${text}" onerror="staticEmoteLoadError(this,'${room_state.login}')">`;
								else
									return `<img class="emote" src="${chanEmote.url}" title="${chanEmote.set}: ${text}" alt="${text}">`;
							}

							// global emotes
							const gblEmote = emoteCache.get(`* ${text}`);
							if (gblEmote) {
								if (staticEmotes && gblEmote.url_static)
									return `<img class="emote" src="${gblEmote.url_static}" title="${gblEmote.set}: ${text}" alt="${text}" onerror="staticEmoteLoadError(this,null)">`;
								else
									return `<img class="emote" src="${gblEmote.url}" title="${gblEmote.set}: ${text}" alt="${text}">`;
							}
						}

						// sanitize remaining characters
						return [...text].map(c => {
							switch (c) {
								case '&': return '&amp;';
								case '<': return '&lt;';
								case '>': return '&gt;';
								case '"': return '&quot;';
								case "'": return '&#039;';
								default: return c;
							}
						}).join('');

						// recombine fragments
					}).join(' ') + '</span>';
				}

				case 'mention': // @username
					return `<span class="mention">${frag.text}</span>`;

				case 'emote': {
					const type = staticEmotes ? 'static' : 'default';
					// NOTE: always grab 2x size
					return `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${frag.emote.id}/${type}/dark/2.0" title="TTV: ${frag.text}" alt="${frag.text}">`;
				}

				case 'cheermote': {
					// get specific cheermote from cache
					const cheermote = cheermoteCache.get(frag.cheermote.prefix)?.find(c => c.tier === frag.cheermote.tier);
					let url = staticEmotes ? cheermote?.url_static : cheermote?.url;
					let color = cheermote?.color;

					// fallback to generic
					if (!cheermote) {
						let tier;
						switch (frag.cheermote.tier) {
							case 10000:	tier = 'red';		color = '#f43021'; break;
							case 5000:	tier = 'blue';		color = '#0099fe'; break;
							case 1000:	tier = 'green';		color = '#1db2a5'; break;
							case 100:	tier = 'purple';	color = '#9c3ee8'; break;
							default:	tier = 'gray';		color = '#979797'; break;
						}
						const type = staticEmotes ? 'animated' : 'static';
						url = `https://static-cdn.jtvnw.net/bits/dark/${type}/${tier}/2`;
					}

					return `<span class="cheermote" title="${frag.text}" style="color: ${color}"><img class="emote" src="${url}" alt="Cheer-"><sup>${frag.cheermote.bits}</sup></span>`;
				}

				default:
					console.warn('unknown message fragment type', frag.type);
					return `<span>frag.text</span>`;
			}
		}).join('');

		// handle message types
		switch (msg.message_type) {
			case 'text':
			// nothing special
			break;

			// known unimplemented special types
			case 'user_intro':
			case 'channel_points_highlighted':
			case 'channel_points_sub_only':
			case 'power_ups_message_effect':
			case 'power_ups_gigantified_emote':
				// may implement the following:
				// msg.channel_points_custom_reward_id
				// msg.channel_points_animation_id
			break;

			// discover more types
			default:
				console.warn('unknown message_type', msg.message_type, msg);
			break;
		}

		// forward message
		appendMessage({
			// channel
			roomid: msg.broadcaster_user_id,
			source: msg.broadcaster_user_login,
			shade: room_state.color,
			avatar: room_state.avatar,
			// user
			userid: msg.chatter_user_id,
			user: msg.chatter_user_login,
			name: msg.chatter_user_name,
			color: msg.color,
			badge: msg.badges?.find(b => ['broadcaster', 'no_audio', 'no_video'].includes(b.set_id))?.set_id,
			// message
			msgid: msg.message_id,
			text: content,
			ping: pingRegEx.test(msg.message.text),
			action: msg.message.text.startsWith('\u0001ACTION '),
		});
	});

	chatRooms.addEventListener('click', (e) => {
		if (chatInput.readOnly) return;

		const room = e.target.closest('[data-room]')?.dataset.room;
		if (room) {
			e.stopPropagation();
			activateChannel(room);
		}
	});

	document.addEventListener('keydown', (e) => {
		switch (e.key) {
			case 'Tab':
				e.preventDefault();
				chatInput.focus();
			break;

			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
			case '0':
				// allow typing
				if (document.activeElement === chatInput) return;

				const index = e.key.charCodeAt() - 49;
				const el = chatRooms.children[index];
				activateChannel(el?.dataset.room);
			break;
		}
	});

	chatInput.addEventListener('keydown', (e) => {
		switch (e.key) {
			case 'Escape': {
				e.preventDefault();

				if (chatInput.readOnly) return;

				if (chatInput.value.length > 0) {
					chatInput.dataset.historyIndex = commandHistory.length;
					chatInput.value = '';
					refreshCommands();
				} else {
					chatInput.blur();
				}
			} break;

			case 'Tab': {
				e.preventDefault();

				if (chatInput.readOnly || chatInput.value.startsWith('/')) return;

				const current = chatRooms.querySelector('.active');
				current?.classList.remove('active');

				// cycle to next
				const cycleElement = !!e.shiftKey
					? current?.previousElementSibling ?? chatRooms.querySelector(':scope > :last-child') // backwards
					: current?.nextElementSibling ?? chatRooms.querySelector(':scope > :first-child'); // forwards

				if (cycleElement) {
					activateChannel(cycleElement.dataset.room);
					chatInput.focus();
				}
			} break;

			case 'ArrowUp': {
				if (chatCommands.querySelector('option:not([disabled])')) return;
				e.preventDefault();

				const index = Math.max(0, parseInt(chatInput.dataset.historyIndex ?? commandHistory.length) - 1);
				chatInput.dataset.historyIndex = index;
				chatInput.value = commandHistory[index] ?? '';
				chatInput.setSelectionRange(-1, -1);
			} break;

			case 'ArrowDown': {
				if (chatCommands.querySelector('option:not([disabled])')) return;
				e.preventDefault();

				const index = Math.min(commandHistory.length, parseInt(chatInput.dataset.historyIndex) + 1);
				chatInput.dataset.historyIndex = index;
				chatInput.value = commandHistory[index] ?? '';
				chatInput.setSelectionRange(-1, -1);
			} break;
		}
	});

	chatInput.addEventListener('input', () => {
		refreshCommands();
	});

	function refreshCommands() {
		// populate options
		if (chatCommands.childElementCount === 0) {
			const commands = [
				{ name: '/background',			desc: '/background <channel name/number> <hex color>'},
				{ name: '/botcommands',			desc: '/botcommands <true|false>'},
				{ name: '/channel',				desc: '/channel <channel name/number>'},
				{ name: '/fresh',				desc: '/fresh <# seconds>'},
				{ name: '/history',				desc: '/history <# messages>'},
				{ name: '/ignore',				desc: '/ignore <user names>'},
				{ name: '/join',				desc: '/join <channel names>'},
				{ name: '/leave',				desc: '/leave <channel names/numbers>'},
				{ name: '/logout',				desc: '/logout'},
				{ name: '/lurk',				desc: '/lurk'},
				{ name: '/me',					desc: '/me <action>'},
				{ name: '/mute',				desc: '/mute <channel names/numbers>'},
				{ name: '/prune',				desc: '/prune <# seconds>'},
				{ name: '/purge',				desc: '/purge <channel names/numbers>'},
				{ name: '/purgeall',			desc: '/purgeall'},
				{ name: '/shrug',				desc: '/shrug <message>'},
				{ name: '/solo',				desc: '/solo <channel names/numbers>'},
				{ name: '/staticemotes',		desc: '/staticemotes <true|false>'},
				{ name: '/thirdpartyemotes',	desc: '/thirdpartyemotes <true|false>'},
				{ name: '/unignore',			desc: '/unignore <user>'},
				{ name: '/unmute',				desc: '/unmute <channel names/numbers>'},
				{ name: '/unmuteall',			desc: '/unmuteall'},
			];

			for (const cmd of commands) {
				const el = document.createElement('option');
				el.label = cmd.desc;
				el.value = cmd.name;
				el.disabled = true;
				chatCommands.appendChild(el);
			}
		}

		// disable options
		chatCommands.querySelectorAll('option:not([disabled])')
			.forEach(opt => opt.disabled = true);

		// commands must start with /
		if (!chatInput.value.startsWith('/'))
			return;

		// find exact match (don't enable option because it prevents ENTER key on Chrome)
		if (chatCommands.querySelector(`option[value="${chatInput.value}" i]`))
			return;

		// find partial matches (enable potential options)
		chatCommands.querySelectorAll(`option[value^="${chatInput.value}" i]`)
			.forEach(opt => opt.disabled = false);
	}

	chatInput.addEventListener('keyup', async (e) => {
		switch (e.key) {
			case 'Enter': {
				e.preventDefault();

				let content = chatInput.value
					.replace(/\s\s+/g, ' ') // remove excess whitespace
					.trimEnd();

				if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return;

				const currentChannel = chatRooms.querySelector('.active')?.dataset.room;
				if (!currentChannel) return;

				const commitValue = () => {
					commandHistory.push(chatInput.value);
					if (commandHistory.length > MAX_COMMAND_HISTORY)
						commandHistory.shift();
					chatInput.dataset.historyIndex = commandHistory.length;
					chatInput.value = '';
					refreshCommands();
				};

				if (chatInput.value.startsWith('/')) {
					let delimIndex = content.indexOf(' ');
					if (delimIndex < 0) delimIndex = content.length;

					const cmd = content.substring(1, delimIndex).toUpperCase();
					const arg = content.substring(delimIndex + 1);

					// returns name from index or partial match
					const channelFromArg = (arg) => {
						if (!arg)
							return null;

						arg = cleanName(arg);

						if (!isNaN(arg))
							return chatRooms.querySelector(`:nth-child(${arg})`)?.dataset.room;

						return chatRooms.querySelector(`[data-room*="${arg}"]`)?.dataset.room;
					};

					// handle /commands
					switch (cmd) {
						case 'ME': {
							// do nothing, allow command as is
						} break;

						case 'LURK': {
							content = '/me is now lurking';
						} break;

						case 'SHRUG': {
							if (arg.length + 10 > MAX_MESSAGE_LENGTH) return;
							content = arg + ' ¯\\_(ツ)_/¯';
						} break;

						/* === LOCAL COMMANDS === */

						case 'LOGOUT': {
							twitch.revokeAccessToken();
							deleteConfig('access_token');
						} return;

						case 'C':
						case 'CHAN':
						case 'CHANNEL': {
							const channelName = channelFromArg(arg);
							if (!channelName) return;

							activateChannel(channelName);
							commitValue();
						} return;

						case 'PURGE': {
							// remove messages from one or more channels
							const channelNames = arg.length === 0
								? [currentChannel]
								: arg.split(/[ ,]+/).map(channelFromArg).filter(isValidTwitchAccount);

							if (channelNames.length === 0) return;

							channelNames.forEach(chan => {
								const room_state = roomState.get(chan);
								chatOutput.querySelectorAll(`.msg[data-roomid="${room_state.id}"]`)
									.forEach(el => el.remove());
							});
							commitValue();
						} return;

						case 'PURGEALL': {
							// clear all messages
							chatOutput.querySelectorAll('.msg')
								.forEach(el => el.remove());
							commitValue();
						} return;

						case 'J':
						case 'JOIN': {
							// NOTE: user may specify name:color
							const channels = parseChannelString(arg);

							if (!channels || channels.length === 0) return;

							joinChannels(...channels);
							commitValue();
						} return;

						case 'PART':
						case 'L':
						case 'LEAVE': {
							const channelNames = arg.length === 0
								? [currentChannel]
								: arg.split(/[ ,]+/).map(channelFromArg).filter(isValidTwitchAccount);

							if (channelNames.length === 0) return;

							partChannels(...channelNames);
							commitValue();
						} return;

						case 'MUTE': {
							const channelNames = arg.length === 0
								? [currentChannel]
								: arg.split(/[ ,]+/).map(channelFromArg).filter(isValidTwitchAccount);

							if (channelNames.length === 0) return;

							channelNames.forEach(name => toggleMute(name, true));
							commitValue();
						} return;

						case 'UNMUTE': {
							const channelNames = arg.length === 0
								? [currentChannel]
								: arg.split(/[ ,]+/).map(channelFromArg).filter(isValidTwitchAccount);

							if (channelNames.length === 0) return;

							channelNames.forEach(name => toggleMute(name, false));
							commitValue();
						} return;

						case 'UNMUTEALL': {
							[...roomState.keys()].forEach(name => toggleMute(name, false));
							commitValue();
						} return;

						case 'SOLO': {
							const channelNames = arg.length === 0
								? [currentChannel]
								: arg.split(/[ ,]+/).map(channelFromArg).filter(isValidTwitchAccount);

							if (channelNames.length === 0) return;

							[...roomState.keys()].forEach(name => {
								const muteState = !channelNames.includes(name);
								toggleMute(name, muteState)
							});
							commitValue();
						} return;

						case 'BG':
						case 'BACKGROUND': {
							const args = arg.split(/[ :]+/, 2);
							// can specify just a color, or a name and a color
							const channelName = args.length === 1 ? currentChannel : channelFromArg(args[0]);
							const hexColor = '#'+cleanHex(args.length === 1 ? args[0] : args[1]);

							const room_state = roomState.get(channelName);
							if (!room_state) return;

							room_state.color = isValidHexColor(hexColor) ? hexColor : undefined;
							chatOutput.querySelectorAll(`.msg[data-roomid="${room_state.id}"]`)
								.forEach(el => el.style.backgroundColor = room_state.color);
							updateUrl();
							commitValue();
						} return;

						case 'IGNORE': {
							if (arg) {
								const userNames = arg.split(/[ ,]+/).map(cleanName).filter(isValidTwitchAccount);

								userNames.forEach(user => {
									ignoredUsers.add(user);
									// remove previous messages
									// NOTE: we don't store username directly and don't map a username to a user id...
									const selector = `.msg-user a[href="https://twitch.tv/${user}"]`;
									chatOutput.querySelectorAll(selector)
										.forEach(el => el.closest('.msg').remove());
								});
								updateUrl();
							}

							noticeMessage(`ignoring: ${[...ignoredUsers].join(' ')}`);
							commitValue();
						} return;

						case 'UNIGNORE': {
							if (arg) {
								const userNames = arg.split(/[ ,]+/).map(cleanName).filter(isValidTwitchAccount);

								userNames.forEach(user => ignoredUsers.delete(user));
								updateUrl();
							}

							noticeMessage(`ignoring: ${[...ignoredUsers].join(' ')}`);
							commitValue();
						} return;

						case 'BOTCOMMANDS': {
							botCommands = arg === 'true';
							updateUrl();
							commitValue();
						} return;

						case 'STATICEMOTES': {
							staticEmotes = arg === 'true';
							updateUrl();
							commitValue();
						} return;

						case 'THIRDPARTYEMOTES': {
							thirdPartyEmotes = arg === 'true';
							if (thirdPartyEmotes) {
								loadThirdPartyGlobalEmotes();
								[...roomState.values()].forEach(room_state => loadThirdPartyChannelEmotes(room_state));
							}
							updateUrl();
							commitValue();
						} return;

						case 'HISTORY': {
							const val = parseInt(arg);
							if (isNaN(val)) return;

							messageHistory = val;
							updateUrl();
							commitValue();
						} return;

						case 'PRUNE': {
							const val = parseInt(arg) * 1000;
							if (isNaN(val)) return;

							pruneMessageTime = val;
							updateUrl();
							commitValue();
						} return;

						case 'FRESH': {
							const val = parseInt(arg) * 1000;
							if (isNaN(val)) return;

							freshMessageTime = val;
							updateUrl();
							commitValue();
						} return;

						// reject everything else
						default: return;
					}
				}

				// any commands reaching this point will be sent to twitch
				if (twitch.connected) {
					const room_state = roomState.get(currentChannel);
					if (!room_state.joined || room_state.muted) return;

					// hold onto message until confirmation
					chatInput.readOnly = true;

					// send the message
					const res = await twitch.sendChatMessage({ // user:write:chat
						broadcaster_id: room_state.id,
						sender_id: userState.id,
						message: content,
						//reply_parent_message_id: '',
					});

					if (res.success && res.data.is_sent && !res.data.drop_reason) {
						commitValue();
					} else {
						// failure
						const text = res.success ? res.data.drop_reason.message : res.data.message;
						noticeMessage(text, {
							source: currentChannel,
							shade: room_state.color,
							avatar: room_state.avatar,
						});
					}

					chatInput.readOnly = false;
				} else {
					errorMessage('failed to send message (invalid connection state)');
				}

				scrollToBottom();
			} break;
		}
	});

	// timer functions that may modify state
	window.intervalTimer = setInterval(() => {
		const shouldScroll = isScrolledToBottom();
		const now = new Date().getTime();

		// prune messages (only if scrolled to bottom to allow reading history easily)
		if (shouldScroll) {
			const pruneTime = pruneMessageTime > 0 ? now - pruneMessageTime : undefined;
			const messages = chatOutput.querySelectorAll('.msg');
			let removeCount = messageHistory > 0 ? messages.length - messageHistory : 0;

			messages.forEach(el => {
				if (el.dataset.time < pruneTime || removeCount > 0) {
					el.remove();
					removeCount--;
				}
			});
		}

		// move tracker down page
		if (freshMessageTime > 0 && chatTracker) {
			const freshTime = now - freshMessageTime;

			// move up (would only happen if user adjusts freshTime)
			while (chatTracker.previousElementSibling?.dataset.time > freshTime) {
				chatTracker.previousElementSibling.before(chatTracker);
			}

			// move down
			while (chatTracker.nextElementSibling?.dataset.time < freshTime) {
				chatTracker.nextElementSibling.after(chatTracker);
			}
		}

		if (shouldScroll) scrollToBottom();
	}, 1_000);

}, { once: true });

function twitchAuthorizeRedirect() {
	// persist settings to temp storage to retrieve after twitch redirect
	const state_uuid = self.crypto.randomUUID();
	setConfig(state_uuid, pageUrl.search, true);

	// https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow
	const url = new URL('https://id.twitch.tv/oauth2/authorize');

	url.searchParams.set('response_type', 'token')
	url.searchParams.set('scope', client_scope)
	url.searchParams.set('force_verify', false);
	url.searchParams.set('client_id', client_id)
	url.searchParams.set('redirect_uri', redirect_uri)
	url.searchParams.set('state', state_uuid);

	// redirect to twitch to obtain authorization
	console.log('redirecting to twitch account authorization site');
	window.location.replace(url.toString());
}

function twitchAccessToken() {
	// twitch redirect provides parameters in # part of URL
	const twitchParams = new URLSearchParams(pageUrl.hash.substring(1));

	// attempt to retrieve token from URL, fallback to storage
	// user may supply an access_token manually to avoid login process
	const access_token = twitchParams.get('access_token') ?? getConfig('access_token');
	if (!access_token) {
		twitchAuthorizeRedirect();
		throw 'no access_token!';
	}

	// if state exists then we were redirected from twitch
	const state_uuid = twitchParams.get('state');
	if (state_uuid) {
		// SECURITY: clean sensitive data
		pageUrl.hash = '';
		pageUrl.search = getConfig(state_uuid);
		deleteConfig(state_uuid);
		// update url
		window.history.replaceState({}, '', pageUrl.toString());
	}

	return access_token;
}

async function loadTwitchCheermotes() {
	const data = await twitch.getCheermotes();

	for (const emote of data) {
		const arr = emote.tiers.map(t => {
			return {
				tier: t.min_bits,
				color: t.color,
				// NOTE: always grab 2x size
				url: t.images.dark.animated[2],
				url_static: t.images.dark.static[2],
			};
		});
		// NOTE: message api seems to return lowercase prefix (match that here)
		cheermoteCache.set(emote.prefix.toLowerCase(), arr);
	}

	console.log('loaded', cheermoteCache.size, 'global cheermotes');
}

// TODO: max 60 requests/minute
async function loadThirdPartyGlobalEmotes() {
	if (!thirdPartyEmotes || [...emoteCache.keys()].find(key => key.startsWith(`* `))) return;

	// https://adiq.stoplight.io/docs/temotes/YXBpOjMyNjU2ODIx-t-emotes-api
	const apiUrl = 'https://emotes.adamcy.pl/v1/global/emotes/7tv.bttv.ffz';

	// https://github.com/CrippledByte/emotes-api
	// const apiUrl = 'https://emotes.crippled.dev/v1/global/all';

	try {
		const res = await fetch(apiUrl, {
			'headers': {
				'Accept': 'application/json',
			},
			method: 'GET',
			mode: 'cors',
			cache: 'force-cache',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
		});

		if (res.ok) {
			const data = await res.json();

			let count = 0;
			for (const emote of data) {
				// store in global cache with prefix
				const key = `* ${emote.code}`;
				// for conflicts, prioritize the first source
				if (!emoteCache.has(key)) {
					const parsedEmote = parseThirdPartyEmote(emote);
					if (parsedEmote) {
						emoteCache.set(key, parsedEmote);
						count++;
					}
				}
			}

			console.log('loaded', count, 'third-party global emotes');
		} else {
			console.warn('failed loading third-party global emotes');
		}
	} catch (err) {
		console.error('failed loading third-party global emotes', err.message);
	}
}

async function loadThirdPartyChannelEmotes(room_state) {
	if (!thirdPartyEmotes || room_state.loadedEmotes) return;

	// https://adiq.stoplight.io/docs/temotes/YXBpOjMyNjU2ODIx-t-emotes-api
	const apiUrl = `https://emotes.adamcy.pl/v1/channel/${room_state.login}/emotes/7tv.bttv.ffz`;

	// BACKUP (slower)
	// https://github.com/CrippledByte/emotes-api
	// const apiUrl = `https://emotes.crippled.dev/v1/channel/${room_state.login}/all`;

	try {
		const res = await fetch(apiUrl, {
			'headers': {
				'Accept': 'application/json',
			},
			method: 'GET',
			mode: 'cors',
			cache: 'force-cache',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
		});

		if (res.ok) {
			const data = await res.json();

			let count = 0;
			for (const emote of data) {
				// store in global cache with prefix
				const key = `${room_state.login} ${emote.code}`;
				// for conflicts, prioritize the first source
				if (!emoteCache.has(key)) {
					const parsedEmote = parseThirdPartyEmote(emote);
					if (parsedEmote) {
						emoteCache.set(key, parsedEmote);
						count++;
					}
				}
			}

			console.log('loaded', count, 'third-party emotes', room_state.login);
		} else {
			console.warn('failed loading third-party emotes', room_state.login);
		}
		room_state.loadedEmotes = true;
	} catch (err) {
		console.error('failed loading third-party emotes', room_state.login, err.message);
	}
}

function parseThirdPartyEmote(emote) {
	// ignore TTV emotes since they're provided by twitch
	if (emote.provider === 0) return;

	// NOTE: always grab 2x size because it scales better
	const url = emote.urls.find(o => o.size === '2x')?.url;
	if (!url) return;

	return {
		set: emote.provider === 0 ? 'TTV'
			: emote.provider === 1 ? '7TV'
			: emote.provider === 2 ? 'BTTV'
			: emote.provider === 3 ? 'FFZ'
			: undefined,
		url: url,
		// HACK: manipulate url to attempt to find static version
		// not guaranteed to exist. if img.onerror, will replace the static url with regular url
		url_static: emote.provider === 0 ? url.replace('/default/','/static/')
			: emote.provider === 1 ? url.replace(/\/emote\/(.*)\/2x/,'/emote/$1/2x_static')
			: emote.provider === 2 ? url.replace(/\/emote\/(.*)\/2x/,'/emote/$1/static/2x')
			: emote.provider === 3 ? url.replace('/animated/','/')
			: undefined,
	};
}

function staticEmoteLoadError(img, chan) {
	console.warn('staticEmoteLoadError', chan, img.alt);
	// static url failed to load on img
	img.onerror = null;
	// get channel (or global) emote from cache
	const key = chan ? `${chan} ${img.alt}` : `* ${img.alt}`;
	const emote = emoteCache.get(key);
	// replace img src with default url
	img.src = emote.url;
	// remove referenced url_static to avoid using it again
	[...emoteCache.values()]
		.filter(e => e.url_static === emote.url_static)
		.forEach(e => e.url_static = null);
}

async function joinChannels(...channels) {
	// ignore already loaded channels
	channels = channels?.filter(chan => !roomState.has(chan.name));
	// enforce channel limit
	const joinLimit = MAX_CHANNEL_LIMIT - roomState.size;
	channels = channels?.slice(0, joinLimit);
	// abort if nothing left
	if (!channels || channels.length === 0) return;

	// verify remaining channels and return details
	const data = await twitch.getUsers(...channels.map(chan => chan.name));

	// data contains channels that actually exist
	for (const user of data) {
		const room_state = {
			// twitch info
			id: user.id,
			login: user.login,
			name: user.display_name,
			avatar: user.profile_image_url.replace('profile_image-300x300','profile_image-50x50'),

			// app info
			color: channels.find(chan => chan.name === user.login)?.color,
			joined: false,
			muted: true,
			loadedEmotes: false,
			subscriptions: new Map(),
		};
		roomState.set(user.login, room_state);

		// update ui
		const el = document.createElement('li');
		el.innerHTML = `<img class="avatar" src="${room_state.avatar}">${room_state.login}`;
		el.dataset.room = room_state.login;
		el.classList.add('muted');

		// set active if none already
		if (!chatRooms.children.length)
			el.classList.add('active');

		// attempt to insert alphabetically
		const sibling = [...chatRooms.querySelectorAll('[data-room]')]
			.find(e => room_state.login.localeCompare(e.dataset.room) < 1);
		if (sibling)
			chatRooms.insertBefore(el, sibling);
		else
			chatRooms.appendChild(el);

		noticeMessage(`joined #${room_state.login}`, {
			roomid: room_state.id,
			source: room_state.login,
			shade: room_state.color,
			avatar: room_state.avatar,
		});

		// subscribe to twitch events
		const subscribe = async (data) => {
			if (room_state.subscriptions.has(data.type)) return;

			const res = await twitch.createSubscription(data);

			if (res.data?.[0].status === 'enabled') {
				room_state.subscriptions.set(res.data[0].type, res.data[0].id);
			} else {
				console.warn('failed subscription', res);
			}

			return res;
		};

		// TODO: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelupdate

		const result = await subscribe({
			type: 'channel.chat.message', // cost 0, user:read:chat
			version: '1',
			condition: {
				broadcaster_user_id: room_state.id,
				user_id: userState.id,
			},
		});

		if (result.error) {
			// failed primary subscription, everything else must fail
			await partChannels(room_state.login);

			noticeMessage(`failed to join #${room_state.login} (${result.error} - ${result.message})`, {
				roomid: room_state.id,
				source: room_state.login,
				shade: room_state.color,
				avatar: room_state.avatar,
			});

			continue;
		}

		await subscribe({
			type: 'channel.chat.message_delete', // cost 0, user:read:chat
			version: '1',
			condition: {
				broadcaster_user_id: room_state.id,
				user_id: userState.id,
			},
		});

		await subscribe({
			type: 'channel.chat.clear_user_messages', // cost 0, user:read:chat
			version: '1',
			condition: {
				broadcaster_user_id: room_state.id,
				user_id: userState.id,
			},
		});

		await subscribe({
			type: 'channel.chat.clear', // cost 0, user:read:chat
			version: '1',
			condition: {
				broadcaster_user_id: room_state.id,
				user_id: userState.id,
			},
		});

		// TODO: when there's a cost we need to throttle subscriptions

		//await subscribe({
		//	type: 'stream.online', // cost 1
		//	version: '1',
		//	condition: {
		//		broadcaster_user_id: room_state.id,
		//	},
		//});

		//await subscribe({
		//	type: 'stream.offline', // cost 1
		//	version: '1',
		//	condition: {
		//		broadcaster_user_id: room_state.id,
		//	},
		//});

		//await subscribe({
		//	type: 'channel.raid', // cost 1
		//	version: '1',
		//	condition: {
		//		to_broadcaster_user_id: room_state.id,
		//	},
		//});

		room_state.joined = true;
		toggleMute(room_state.login, false);

		loadThirdPartyChannelEmotes(room_state);
	}

	updateUrl();
}

async function partChannels(...channels) {
	for (const channel of channels) {
		const room_state = roomState.get(channel);
		if (!room_state || !room_state.joined) continue;

		toggleMute(room_state.login, true);

		// unsubscribe to twitch events
		for (const [type, id] of room_state.subscriptions) {
			room_state.subscriptions.delete(type);
			await twitch.deleteSubscription(id);
		}

		// remove messages
		const selector = `.msg[data-roomid="${room_state.id}"]`;
		chatOutput.querySelectorAll(selector)
			.forEach(el => el.remove());

		// update ui
		const el = chatRooms.querySelector(`[data-room="${channel}"]`);
		if (el) {
			// set new active channel if this was active
			if (el.classList.contains('active')) {
				(el.nextElementSibling ?? el.previousElementSibling)?.classList.add('active');
			}

			el.remove();
		}

		// remove channel emotes
		if (room_state.loadedEmotes) {
			const prefix = `${room_state.login} `;
			[...emoteCache.keys()]
				.filter(key => key.startsWith(prefix))
				.forEach(key => emoteCache.delete(key));
			room_state.loadedEmotes = false;
		}

		// finalize
		if (room_state.joined) {
			noticeMessage(`left #${channel}`, {
				source: channel,
				shade: room_state.color,
				avatar: room_state.avatar,
			});
		}
		room_state.joined = false;
		roomState.delete(channel);
	}

	updateUrl();
}

function activateChannel(channel) {
	if (!channel) return;

	// deactivate old
	chatRooms.querySelector('.active')?.classList.remove('active');

	// activate new
	chatRooms.querySelector(`[data-room="${channel}"]`)?.classList.add('active');
}

function toggleMute(channel, state) {
	const room_state = roomState.get(channel);
	if (!room_state || !room_state.joined || room_state.muted === state) return;

	// toggle mute
	room_state.muted = state;
	chatRooms.querySelector(`[data-room="${room_state.login}"]`)?.classList.toggle('muted', room_state.muted);

	// clear messages
	if (room_state.muted) {
		chatOutput.querySelectorAll(`.msg[data-roomid="${room_state.id}"]`)
			.forEach(el => el.remove());
	}
}

function createMessageFragment(info) {
	const clone = chatTemplate.content.cloneNode(true);
	const now = new Date();

	const msg = clone.querySelector('.msg');
	if (msg) {
		msg.dataset.time = now.getTime();
		msg.dataset.msgid = info.msgid;
		msg.dataset.roomid = info.roomid;
		msg.dataset.userid = info.userid;

		msg.classList.toggle('system', info.system);
		msg.classList.toggle('event', info.event);
		msg.classList.toggle('action', info.action);
		msg.classList.toggle('ping', info.ping);
		msg.style.backgroundColor = info.shade;
	}

	const room = clone.querySelector('.msg-room');
	if (room && info.source) {
		const el = document.createElement('a');
		el.tabIndex = -1;
		el.href = `https://twitch.tv/${info.source}`;
		el.title = info.source;
		//el.textContent = info.source;
		el.innerHTML = `<img class="avatar" src="${info.avatar}">`;
		room.appendChild(el);
	}

	const user = clone.querySelector('.msg-user');
	if (user) {
		if (info.system) {
			user.textContent = info.name;
		} else {
			// message from user
			// support localized names
			const friendlyName = info.name.localeCompare(info.user, undefined, { sensitivity: 'base' }) === 0
				? info.name
				: `${info.name} (${info.user})`;

			const el = document.createElement('a');
			el.tabIndex = -1;
			el.href = `https://twitch.tv/${info.user}`;
			el.title = friendlyName;

			switch (info.badge) {
				case 'broadcaster':
					el.innerHTML = `<img class="badge" src="https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/2">${friendlyName}`;
				break;

				//case 'no_audio':
				//	el.innerHTML = `<img class="badge" src="https://static-cdn.jtvnw.net/badges/v1/aef2cd08-f29b-45a1-8c12-d44d7fd5e6f0/2">${friendlyName}`;
				//break;

				//case 'no_video':
				//	el.innerHTML = `<img class="badge" src="https://static-cdn.jtvnw.net/badges/v1/199a0dba-58f3-494e-a7fc-1fa0a1001fb8/2">${friendlyName}`;
				//break;

				default:
					el.textContent = friendlyName;
				break;
			}

			if (info.color) {
				let hexColor = colorCache.get(info.color);
				if (!hexColor) {
					// convert to HSL to manipulate color
					const hslColor = hexToHsl(info.color);
					// ensure color is not too extreme by clamping values
					hslColor.s = Math.min(hslColor.s, 80);
					hslColor.l = Math.max(hslColor.l, 60);
					// convert back to hex
					hexColor = hslToHex(hslColor.h, hslColor.s, hslColor.l);
					// add to cache
					colorCache.set(info.color, hexColor);
				}
				el.style.color = hexColor;
			}

			user.appendChild(el);
		}
	}

	const body = clone.querySelector('.msg-body');
	if (body) {
		// NOTE: innerHTML MUST BE SANITIZED!!
		body.innerHTML = info.text;
	}

	const time = clone.querySelector('.msg-time');
	if (time) {
		time.title = now.toLocaleString();
		time.textContent = now.toLocaleTimeString();
	}

	return clone;
}

function isScrolledToBottom() {
	// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
	return Math.abs(chatOutput.scrollHeight - chatOutput.clientHeight - chatOutput.scrollTop) <= 1;
}

function scrollToBottom() {
	chatOutput.scrollTo({
		top: chatOutput.scrollHeight,
		behavior: 'instant'
	});
}

function appendMessage(info) {
	const shouldScroll = isScrolledToBottom();

	const fragment = createMessageFragment(info);
	chatOutput.appendChild(fragment);

	if (shouldScroll) scrollToBottom();
}

function noticeMessage(text, format) {
	appendMessage({
		...format,
		system: true,
		name: 'NOTICE>',
		text: text,
	});
}

function errorMessage(text, format) {
	appendMessage({
		...format,
		system: true,
		name: 'NOTICE>',
		text: text,
		shade: 'red',
	});
}

function parseChannelString(data) {
	if (!data) return null;
	// name1:color1,name2:color2
	return data.split(/[ ,]+/, MAX_CHANNEL_LIMIT)
		// name:color
		.map(s => {
			const [name, color] = s.split(':', 2);

			return {
				name: cleanName(name),
				color: isValidHexColor(color) ? '#'+cleanHex(color) : undefined,
			};
		})
		.filter(chan => isValidTwitchAccount(chan.name));
}

function updateUrl() {
	const params = new URLSearchParams();

	const joined = [...roomState]
		.filter(([k,v]) => v.joined)
		.sort(([a],[b]) => a.localeCompare(b));

	const channelString = joined
		.map(([k,v]) => v.color ? `${k}:${v.color.replace('#','')}` : k)
		.join(',');
	params.set('channels', channelString);

	const ignore = [...ignoredUsers]
		.sort((a,b) => a.localeCompare(b))
		.join(',');
	params.set('ignore', ignore);

	params.set('botcommands', botCommands);
	params.set('staticemotes', staticEmotes);
	params.set('thirdpartyemotes', thirdPartyEmotes);
	params.set('history', messageHistory);
	params.set('prune', pruneMessageTime / 1000);
	params.set('fresh', freshMessageTime / 1000);
	params.set('readonly', chatPanel.classList.contains('hidden'));

	// update page
	chatTracker?.classList.toggle('invisible', freshMessageTime <= 0);
	document.title = pageTitle + ' ' + joined.map(([k]) => '#'+k).join(' ');

	pageUrl.hash = '';
	pageUrl.search = decodeURIComponent(params.toString());
	window.history.replaceState({}, '', pageUrl.toString());
}

function hexToHsl(c) {
	// https://stackoverflow.com/a/12043228
	if (c[0] === '#')
		c = c.substring(1); // strip #
	const rgb = parseInt(c, 16);  // convert rrggbb to decimal
	let r = (rgb >> 16) & 0xff; // extract red
	let g = (rgb >>  8) & 0xff; // extract green
	let b = (rgb >>  0) & 0xff; // extract blue

	// https://gist.github.com/mjackson/5311256?permalink_comment_id=4750719#gistcomment-4750719
	let max = Math.max(r, g, b), min = Math.min(r, g, b);
	const componentCase = max == r ? 0 : (max == g ? 1 : 2); // is max r g or b?
	r /= 255, g /= 255, b /= 255, min /= 255, max /= 255;
	let h, s, l = (max + min) / 2;
	if (max == min) {
		h = s = 0; // achromatic
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (componentCase) {
			case 0: h = (g - b) / d + (g < b ? 6 : 0); break;
			case 1: h = (b - r) / d + 2; break;
			case 2: h = (r - g) / d + 4; break;
		}
		h /= 6;
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
}

// https://stackoverflow.com/a/44134328
function hslToHex(h, s, l) {
	l /= 100;
	const a = s * Math.min(l, 1 - l) / 100;
	const f = n => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color).toString(16).padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

// https://javascript.info/cookie
function getCookie(name) {
	if (!name) return undefined;

	const matches = document.cookie.match(new RegExp(
		'(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'
	));
	return matches ? decodeURIComponent(matches[1]) : undefined;
}

function setCookie(name, value, attributes = {}) {
	attributes = {
		'path': pageUrl.pathname.substring(0, pageUrl.pathname.lastIndexOf('/')),
		'samesite': 'strict',
		'secure': true,
		...attributes
	};

	if (attributes.expires instanceof Date) {
		attributes.expires = attributes.expires.toUTCString();
	}

	let updatedCookie = encodeURIComponent(name) + '=' + encodeURIComponent(value);

	for (let attributeKey in attributes) {
		updatedCookie += '; ' + attributeKey;
		const attributeValue = attributes[attributeKey];
		if (attributeValue !== true) {
			updatedCookie += '=' + attributeValue;
		}
	}

	document.cookie = updatedCookie;
}

function deleteCookie(name) {
	setCookie(name, '', {
		'max-age': -1
	});
}

// wrapper to prioritize localStorage (if available) for efficiency/security (cookies get sent to server on requests)
function setConfig(name, val, sessionOnly) {
	try {
		const storage = sessionOnly ? window.sessionStorage : window.localStorage;
		if (storage) {
			storage.setItem(name, val);
			return;
		}
	} catch (err) {
		console.warn('setConfig', err);
	}

	// fallback
	if (sessionOnly)
		setCookie(name, val);
	else
		setCookie(name, val, {
			'max-age': 2_592_000 // 30 days
		});
}

function getConfig(name) {
	try {
		const val = window.localStorage?.getItem(name) ?? window.sessionStorage?.getItem(name);
		if (val !== null)
			return val;
	} catch (err) {
		console.warn('getConfig', err);
	}

	// fallback
	return getCookie(name);
}

function deleteConfig(name) {
	try {
		window.sessionStorage?.removeItem(name);
		window.localStorage?.removeItem(name);
	} catch (err) {
		console.warn('deleteConfig', err);
	}

	// ALSO delete for safety
	deleteCookie(name);
}