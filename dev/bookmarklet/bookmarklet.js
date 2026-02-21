(function () {
    /* 設定と定数 */
    const IDE_URL = 'https://aki-coding.github.io/Pyodide_Web_IDE/dev/IDE/Pyodide_IDE.html';
    const CHECK_INTERVAL = 1000;
    
    /* フィードバック用メッセージ定数 */
    const MSG_NO_COMMAND = {
        "cmd": "No_Command",
        "message": "出力の中にコマンド無し。意図したものであれば次のステップへ進んでください。意図したものでなければ修正してください。"
    };
    const MSG_MULTIPLE_COMMANDS = {
        "cmd": "Multiple_commands",
        "message": "システム通知: 複数のコマンド（JSON）が検出されました。一度に実行できるコマンドは一つだけです。順次実行するか、一つに絞ってください。"
    };

    /* 状態管理変数 */
    let state = 'UNKNOWN';
    let ide_window = null;
    let last_response_len = 0;

    /* --- ユーティリティ関数 --- */

    /* JSON抽出関数: テキストからトップレベルのJSONオブジェクトをリストで抽出 */
    function extractJsonObjects(text) {
        const results = [];
        let braceStack = 0;
        let startIndex = null;
        let inString = false;
        let isEscaped = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            if (inString) {
                if (isEscaped) {
                    isEscaped = false;
                } else if (char === '\\\\') { /* バックスラッシュのエスケープ */
                    isEscaped = true;
                } else if (char === '"') {
                    inString = false;
                }
            } else {
                if (char === '"') {
                    inString = true;
                } else if (char === '{') {
                    if (braceStack === 0) {
                        startIndex = i;
                    }
                    braceStack++;
                } else if (char === '}') {
                    if (braceStack > 0) {
                        braceStack--;
                        if (braceStack === 0 && startIndex !== null) {
                            const potentialJson = text.substring(startIndex, i + 1);
                            try {
                                /* JSONとして有効かチェック */
                                JSON.parse(potentialJson);
                                results.push(potentialJson);
                            } catch (e) {
                                console.warn("Gemini Bridge: Invalid JSON block skipped");
                            }
                            startIndex = null;
                        }
                    }
                }
            }
        }
        return results;
    }

    function get_submit_button() {
        const btn = document.querySelector('[aria-label="プロンプトを送信"]');
        return (btn && btn.offsetParent !== null) ? btn : null;
    }

    function get_input_area() {
        return document.querySelector('.ProseMirror') || 
            document.querySelector('[contenteditable="true"]') || 
            document.querySelector('rich-textarea > div > p') ||
            document.querySelector('textarea'); 
    }

    /* --- アクション関数 --- */

    function send_to_IDE(jsonText) {
        if(ide_window) {
            console.log('Gemini Bridge: Sending JSON to IDE:', jsonText.substring(0, 50) + '...');
            ide_window.postMessage({ type: 'GEMINI_RESPONSE', text: jsonText }, '*'); 
        } else {
            console.error('Gemini Bridge: IDE window not found');
        }
    }

    function submit_to_gemini(text) {
        const input = get_input_area();
        const btn = get_submit_button();
        if(input && btn) {
            console.log('Gemini Bridge: Auto-submitting feedback to Gemini...');
            
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

    /* 回答監視と解析ロジック */
    function check_response() {
        const responses = document.querySelectorAll('model-response');
        if(responses.length > 0) {
            const lastResponse = responses[responses.length - 1];
            const text = lastResponse.innerText;
            
            /* 新しい回答が確定した（長さが変わった）場合のみ処理 */
            if (text.length !== last_response_len) {
                console.log('Gemini Bridge: New response detected. Length:', text.length);
                last_response_len = text.length;

                /* JSON解析 */
                const jsonCandidates = extractJsonObjects(text);
                console.log('Gemini Bridge: Found ' + jsonCandidates.length + ' JSON object(s)');

                if (jsonCandidates.length === 0) {
                    /* ケース1: 有効なJSONがない -> Geminiへフィードバック */
                    console.log('Gemini Bridge: No JSON found. Sending feedback.');
                    submit_to_gemini(JSON.stringify(MSG_NO_COMMAND, null, 4));

                } else if (jsonCandidates.length === 1) {
                    /* ケース2: JSONが1つだけ -> IDEへ送信 */
                    console.log('Gemini Bridge: Valid single JSON found. Sending to IDE.');
                    send_to_IDE(jsonCandidates[0]);

                } else {
                    /* ケース3: JSONが複数ある -> Geminiへフィードバック */
                    console.log('Gemini Bridge: Multiple JSONs found. Sending feedback.');
                    submit_to_gemini(JSON.stringify(MSG_MULTIPLE_COMMANDS, null, 4));
                }
            }
        }
    }

    /* --- 初期化とメインループ --- */

    console.log('Gemini-IDE Bridge: Initializing...');
    ide_window = window.open(IDE_URL, 'gemini_ide_window');

    /* IDEからのメッセージ受信 */
    window.addEventListener('message', (event) => {
        const data = event.data;
        console.log('Gemini Bridge: Received message from IDE', data);

        if (data && data.cmd === 'goal_achieved') {
            alert('目的達成 : ' + data.message);

        } else if (data && data.cmd === 'Notification_completed') {
            alert('ユーザー検証 : ' + data.message);

        } else {
            /* 通常の実行結果などはGeminiへそのまま転送 */
            submit_to_gemini(JSON.stringify(data, null, 4));
        }
    });

    const btn = get_submit_button();
    state = btn ? 'WAITING_FOR_SUBMIT' : 'GENERATING';
    console.log('Gemini Bridge: Initial state = ' + state);

    /* 状態監視ループ */
    setInterval(() => {
        const currentBtn = get_submit_button();
        
        if(state === 'WAITING_FOR_SUBMIT') {
            /* 送信ボタンが消えた = 生成開始 */
            if(!currentBtn) {
                state = 'GENERATING';
                console.log('Gemini Bridge: Generating...');
                /* 生成開始時に前回の長さをリセットしない */
            }
        } else if(state === 'GENERATING') {
            /* 送信ボタンが現れた = 生成完了 */
            if(currentBtn) {
                state = 'COMPLETE';
                console.log('Gemini Bridge: Complete');
                setTimeout(() => {
                    check_response(); /* 生成完了後に解析を実行 */
                    state = 'WAITING_FOR_SUBMIT';
                }, 1000); /* DOM更新待ち */
            }
        }
    }, CHECK_INTERVAL);

    alert('Gemini-IDE Bridge Loaded (JSON Parser v2.1)');
})();