'use strict';

class twitchApi extends EventTarget {
	#clientId;
	#accessToken;

	#socketUrl;
	#socket;
	#sessionId;

	#fetchOptions = {
		mode: 'cors',
		cache: 'no-cache',
		credentials: 'omit',
		referrerPolicy: 'no-referrer',
	};

	get connected() {
		return this.#socket && this.#socket.readyState === 1;
	}

    constructor(clientId, accessToken) {
		super();

		// NOTE: timeout of >=60s sometimes causes browser disconnects (1006 error)
		this.#socketUrl = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';
		this.#clientId = clientId;
		this.#accessToken = accessToken;
    }

	connect() {
		if (this.connected)
			throw 'invalid connection state';

		this.#socket = new WebSocket(this.#socketUrl);
		this.#socket.onopen = this.#socketOpen.bind(this);
		this.#socket.onclose = this.#socketClose.bind(this);
		this.#socket.onerror = this.#socketError.bind(this);
		this.#socket.onmessage = this.#socketMessage.bind(this);
	}

	#reconnect(url) {
		console.warn('reconnecting...', url);

		// connect new socket
		const socket = new WebSocket(url);

		socket.onclose = () => {
			// connection issue
			this.disconnect();
			console.error('failed to connect to new socket');
		};

		socket.onmessage = (e) => {
			const msg = JSON.parse(e.data);

			if (msg.metadata.message_type === 'session_welcome') {
				console.assert(this.#sessionId === msg.payload.session.id, 'session_id mismatch during reconnect!');

				// hook up events to new socket
				socket.onclose = this.#socketClose.bind(this);
				socket.onerror = this.#socketError.bind(this);
				socket.onmessage = this.#socketMessage.bind(this);

				// shutdown old socket
				this.#socket.onopen = null;
				this.#socket.onclose = null;
				this.#socket.onerror = null;
				this.#socket.onmessage = null;
				this.#socket.close();

				// change over
				this.#socket = socket;
				this.#socketUrl = url;
			} else {
				console.warn('unexpected message during reconnect!', msg);
				socket.close();
				this.disconnect();
			}
		};
	}

	disconnect() {
		this.#socket?.close();
	}

	#socketOpen(e) {
		console.log('connected');
		this.dispatchEvent(new CustomEvent('connected', { detail: e }));
	}

	#socketClose(e) {
		console.log('disconnected', e.wasClean, e.code, e.reason);
		this.dispatchEvent(new CustomEvent('disconnected', { detail: {
			wasClean: e.wasClean,
			code: e.code,
			reason: e.reason
		} }));
	}

	#socketError(e) {
		console.error('error', e);
		this.dispatchEvent(new CustomEvent('error', { detail: e }));
	}

	#socketMessage(e) {
		const msg = JSON.parse(e.data);

		const timestamp = new Date(msg.metadata.message_timestamp);
		const messageAge = new Date().getTime() - timestamp.getTime(); // ms

		// ignore old messages (twitch recommendation)
		if (messageAge > 600_000) {
			console.warn('messageAge', msg);
			return;
		}

		const { metadata, payload } = msg;

		// https://dev.twitch.tv/docs/eventsub/websocket-reference/
		switch (metadata.message_type) {
			case 'session_welcome': {
				this.#sessionId = payload.session.id;
				console.info('session_id', this.#sessionId);

				this.dispatchEvent(new CustomEvent('welcome', { detail: payload.session.id }));
			} break;

			case 'session_keepalive': {
				//console.debug(metadata.message_type);
			} break;

			case 'session_reconnect': {
				this.#reconnect(payload.session.reconnect_url);
			} break;

			case 'notification': {
				//console.debug(msg.metadata.message_type, msg.metadata.subscription_type, msg);
				this.dispatchEvent(new CustomEvent(metadata.subscription_type, { detail: payload.event }));
			} break;

			case 'revocation': {
				//console.warn(metadata.message_type, payload.subscription);
				this.dispatchEvent(new CustomEvent(metadata.message_type, { detail: payload.subscription }));
			} break;

			default:
				console.warn('unknown message_type', metadata.message_type, payload);
		}
	}

	// https://dev.twitch.tv/docs/authentication/validate-tokens/
	async validateToken() {
		if (!this.#accessToken) return false;

		try {
			const res = await fetch('https://id.twitch.tv/oauth2/validate', {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
				},
				method: 'GET',
			});

			return await res.json();
		} catch (err) {
			console.error('validateToken', err.message);
		}
	}

	async revokeAccessToken() {
		if (!this.#clientId || !this.#accessToken) return false;

		this.disconnect();

		const data = new URLSearchParams();
		data.append('client_id', this.#clientId);
		data.append('token', this.#accessToken);

		try {
			const res = await fetch('https://id.twitch.tv/oauth2/revoke', {
				...this.#fetchOptions,
				'headers': {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				method: 'POST',
				body: data,
			});

			return res.ok;
		} catch (err) {
			console.error('revokeAccessToken', err.message);
		}
	}

	// https://dev.twitch.tv/docs/api/reference/
	async createSubscription(data) {
		if (!this.connected)
			throw 'invalid connection state';

		try {
			const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
					'Content-Type': 'application/json',
				},
				method: 'POST',
				body: JSON.stringify({
					...data,
					transport: {
						method: 'websocket',
						session_id: this.#sessionId,
					}
				}),
			});

			const json = await res.json();
			console.log('createSubscription', data.type, json);

			return json;
		} catch (err) {
			console.error('createSubscription', err.message);
		}
	}

	async deleteSubscription(id) {
		if (!this.connected)
			throw 'invalid connection state';

		const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');
		url.searchParams.set('id', id);

		try {
			const res = await fetch(url, {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'DELETE',
			});

			console.log('deleteSubscription', id, res.ok);

			return res.ok;
		} catch (err) {
			console.error('deleteSubscription', err.message);
		}
	}

	async getSubscriptions(enabledOnly) {
		if (!this.connected)
			throw 'invalid connection state';

		const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');

		if (enabledOnly) {
			url.searchParams.set('status', 'enabled');
		}

		try {
			const res = await fetch(url, {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'GET',
			});

			const json = await res.json();

			return json;
		} catch (err) {
			console.error('getSubscriptions', err.message);
		}
	}

	async getUsers(...users) {
		const url = new URL('https://api.twitch.tv/helix/users');

		for (const user of users) {
			url.searchParams.append('login', user);
		}

		try {
			const res = await fetch(url, {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'GET',
			});

			const json = await res.json();

			return json.data;
		} catch (err) {
			console.error('getUsers', err.message);
		}
	}

	async getStreams(...users) {
		const url = new URL('https://api.twitch.tv/helix/streams');

		for (const user of users) {
			url.searchParams.append('user_login', user);
		}

		try {
			const res = await fetch(url, {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'GET',
			});

			const json = await res.json();

			return json.data;
		} catch (err) {
			console.error('getStreams', err.message);
		}
	}

	async getCheermotes() {
		try {
			const res = await fetch('https://api.twitch.tv/helix/bits/cheermotes', {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'GET',
			});

			const json = await res.json();

			return json.data;
		} catch (err) {
			console.error('getCheermotes', err.message);
		}
	}

	// user:write:chat
	async sendChatMessage(data) {
		if (!this.connected)
			throw 'invalid connection state';

		try {
			const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
					'Content-Type': 'application/json',
				},
				method: 'POST',
				body: JSON.stringify(data),
			});

			const json = await res.json();

			const reply = res.ok
				? { success: true, data: json.data[0] }
				: { success: false, data: json };

			return reply;
		} catch (err) {
			console.error('sendChatMessage', err.message);
		}
	}

	// user:read:moderated_channels
	async getModeratedChannels(user_id) {
		const url = new URL('https://api.twitch.tv/helix/moderation/channels');

		for (const user of users) {
			url.searchParams.append('user_id', user_id);
			url.searchParams.append('first', 100);
		}

		try {
			const res = await fetch(url, {
				...this.#fetchOptions,
				'headers': {
					'Authorization': `Bearer ${this.#accessToken}`,
					'Client-ID': this.#clientId,
				},
				method: 'GET',
			});

			const json = await res.json();

			return json.data;
		} catch (err) {
			console.error('getModeratedChannels', err.message);
		}
	}

	// https://dev.twitch.tv/docs/api/reference/#delete-chat-messages
	// https://dev.twitch.tv/docs/api/reference/#ban-user
	// https://dev.twitch.tv/docs/api/reference/#unban-user
}
