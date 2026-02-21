javascript:(function () {
	const IDE_URL = 'https://aki-coding.github.io/Pyodide_Web_IDE/prod/IDE/Pyodide_IDE.html';
	const CHECK_INTERVAL = 1000;
	let state = 'UNKNOWN';
	let ide_window = null;
	let last_response_len = 0;

	function get_submit_button() {
		const btn = document.querySelector('[aria-label=&quot;プロンプトを送信&quot;]');
		return (btn && btn.offsetParent !== null) ? btn : null;
	}

	function get_input_area() {
		return document.querySelector('.ProseMirror') || 
			document.querySelector('[contenteditable=&quot;true&quot;]') || 
			document.querySelector('rich-textarea > div > p') ||
			document.querySelector('textarea'); 
	}

	function send_to_IDE(text) {
		if(ide_window) {
			ide_window.postMessage({ type: 'GEMINI_RESPONSE', text: text }, '*'); 
			console.log('Gemini Bridge: Sent to IDE');
		}
	}

	function submit_to_gemini(text) {
		const input = get_input_area();
		const btn = get_submit_button();
		if(input && btn) {
			console.log('Gemini Bridge: Auto-submitting...');
			input.focus();
			input.textContent = text; 
			input.dispatchEvent(new Event('input', { bubbles: true }));
			setTimeout(() => {
				const updatedBtn = get_submit_button();
				if(updatedBtn) {
					updatedBtn.click();
					console.log('Gemini Bridge: Clicked submit');
					state = 'GENERATING';
				}
			}, 500);
		} else {
			console.error('Gemini Bridge: Input or Button not found');
			alert('自動送信エラー: 入力欄または送信ボタンが見つかりません');
		}
	}

	function check_response() {
		const responses = document.querySelectorAll('model-response');
		if(responses.length > 0) {
			const lastResponse = responses[responses.length - 1];
			const text = lastResponse.innerText;
			if (text.length !== last_response_len) {
				send_to_IDE(text);
				last_response_len = text.length;
			}
		}
	}

	console.log('Gemini-IDE Bridge: Initializing...');
	ide_window = window.open(IDE_URL, 'gemini_ide_window');

	window.addEventListener('message', (event) => {
		const data = event.data;
		console.log('Gemini Bridge: Received message', data);

		if (data && data.cmd === 'goal_achieved') {
			alert('目的達成 : ' + data.message);

		} else if (data && data.cmd === 'Notification_completed') {
			alert('ユーザー検証 : ' + data.message);

        } else {
            submit_to_gemini(JSON.stringify(data, null, 4));
        }

	});

	const btn = get_submit_button();
	state = btn ? 'WAITING_FOR_SUBMIT' : 'GENERATING';
	console.log('Gemini Bridge: Initial state = ' + state);

	setInterval(() => {
		const currentBtn = get_submit_button();
		if(state === 'WAITING_FOR_SUBMIT') {
			if(!currentBtn) {
				state = 'GENERATING';
				console.log('Gemini Bridge: Generating...');
				last_response_len = 0;
			}
		} else if(state === 'GENERATING') {
			if(currentBtn) {
				state = 'COMPLETE';
				console.log('Gemini Bridge: Complete');
				setTimeout(() => {
					check_response();
					state = 'WAITING_FOR_SUBMIT';
				}, 1000);
			}
		}
	}, CHECK_INTERVAL);

	alert('Gemini-IDE Bridge Loaded');
})();