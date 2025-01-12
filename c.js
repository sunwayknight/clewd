case '/v1/chat/completions':
  ((req, res) => {
    setTitle('recv...');
    let fetchAPI;
    const abortControl = new AbortController, { signal } = abortControl;
    res.socket.on('close', (async () => {
      abortControl.signal.aborted || abortControl.abort();
    }));
    const buffer = [];
    req.on('data', (chunk => {
      buffer.push(chunk);
    }));
    req.on('end', (async () => {
      let clewdStream, titleTimer, samePrompt = false, shouldRenew = true, retryRegen = false, exceeded_limit = false, nochange = false; //let clewdStream, titleTimer, samePrompt = false, shouldRenew = true, retryRegen = false;
      try {
        const body = JSON.parse(Buffer.concat(buffer).toString());
        let { messages, conversationId } = body;

        // 如果传入了会话ID,使用该ID
        if (conversationId) {
          Conversation.uuid = conversationId;
        }
        /************************* */
        const thirdKey = req.headers.authorization?.match(/(?<=(3rd|oai)Key:).*/), oaiAPI = /oaiKey:/.test(req.headers.authorization), forceModel = /--force/.test(body.model);
        apiKey = thirdKey?.[0].split(',').map(item => item.trim()) || req.headers.authorization?.match(/sk-ant-api\d\d-[\w-]{86}-[\w-]{6}AA/g);
        model = apiKey || forceModel || isPro ? body.model.replace(/--force/, '').trim() : cookieModel;
        let max_tokens_to_sample = body.max_tokens, stop_sequences = body.stop, top_p = typeof body.top_p === 'number' ? body.top_p : undefined, top_k = typeof body.top_k === 'number' ? body.top_k : undefined;
        // 当没有提供API密钥且没有组织ID时,抛出错误提示"No cookie available or apiKey format wrong"
        if (!apiKey && !uuidOrg) {
          throw Error('No cookie available or apiKey format wrong');
        } else if (!changing && !apiKey && (!isPro && model != cookieModel)) {
          CookieChanger();
        }
        await waitForChange();
        /************************* */
        if (messages?.length < 1) {
          throw Error('请传入messages');
        }
        if (!body.stream && 1 === messages.length && JSON.stringify(messages.sort() || []) === JSON.stringify([{
          role: 'user',
          content: 'Hi'
        }].sort())) {
          return res.json({
            choices: [{
              message: {
                content: Main
              }
            }]
          });
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        body.stream && res.setHeader('Content-Type', 'text/event-stream');
        if (!body.stream && messages?.[0]?.content?.startsWith('From the list below, choose a word that best represents a character\'s outfit description, action, or emotion in their dialogue')) {
          return res.json({
            choices: [{
              message: {
                content: 'neutral'
              }
            }]
          });
        }
        if (Config.Settings.AllSamples && Config.Settings.NoSamples) {
          console.log('[33mhaving[0m [1mAllSamples[0m and [1mNoSamples[0m both set to true is not supported');
          throw Error('Only one can be used at the same time: AllSamples/NoSamples');
        }
        //const model = body.model;//if (model === AI.mdl()[0]) {//    return;//}
        if (!modelList.includes(model) && !/claude-.*/.test(model) && !forceModel) {
          throw Error('Invalid model selected: ' + model);
        }
        curPrompt = {
          firstUser: messages.find((message => 'user' === message.role)),
          firstSystem: messages.find((message => 'system' === message.role)),
          firstAssistant: messages.find((message => 'assistant' === message.role)),
          lastUser: messages.findLast((message => 'user' === message.role)),
          lastSystem: messages.findLast((message => 'system' === message.role && '[Start a new chat]' !== message.content)),
          lastAssistant: messages.findLast((message => 'assistant' === message.role))
        };
        prevPrompt = {
          ...prevMessages.length > 0 && {
            firstUser: prevMessages.find((message => 'user' === message.role)),
            firstSystem: prevMessages.find((message => 'system' === message.role)),
            firstAssistant: prevMessages.find((message => 'assistant' === message.role)),
            lastUser: prevMessages.findLast((message => 'user' === message.role)),
            lastSystem: prevMessages.find((message => 'system' === message.role && '[Start a new chat]' !== message.content)),
            lastAssistant: prevMessages.findLast((message => 'assistant' === message.role))
          }
        };
        samePrompt = JSON.stringify(messages.filter((message => 'system' !== message.role)).sort()) === JSON.stringify(prevMessages.filter((message => 'system' !== message.role)).sort());
        const sameCharDiffChat = !samePrompt && curPrompt.firstSystem?.content === prevPrompt.firstSystem?.content && curPrompt.firstUser?.content !== prevPrompt.firstUser?.content;
        shouldRenew = Config.Settings.RenewAlways || !Conversation.uuid || prevImpersonated || !Config.Settings.RenewAlways && samePrompt || sameCharDiffChat;
        retryRegen = Config.Settings.RetryRegenerate && samePrompt && null != Conversation.uuid;
        samePrompt || (prevMessages = JSON.parse(JSON.stringify(messages)));
        let type = '';
        if (apiKey) { type = 'api'; } else if (retryRegen) { //if (retryRegen) {
          type = 'R';
          fetchAPI = await (async (signal, model) => {
            let res;
            const body = {
              prompt: '',
              parent_message_uuid: '',
              timezone: AI.zone(),
              attachments: [],
              files: [],
              rendering_mode: 'raw'
            };
            let headers = {
              ...AI.hdr(Conversation.uuid || ''),
              Accept: 'text/event-stream',
              Cookie: getCookies()
            };
            if (Config.Settings.Superfetch) {
              const names = Object.keys(headers), values = Object.values(headers);
              headers = names.map(((header, idx) => `${header}: ${values[idx]}`));
            }
            res = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/organizations/${uuidOrg || ''}/chat_conversations/${Conversation.uuid || ''}/retry_completion`, {
              stream: true,
              signal,
              method: 'POST',
              body: JSON.stringify(body),
              headers
            });
            updateParams(res);
            await checkResErr(res);
            return res;
          })(signal, model);
        } else if (shouldRenew) {
          if (conversationId) {  // 只有在没有会话ID时才创建新会话
            type = 'c';
          } else {
            Conversation.uuid && await deleteChat(Conversation.uuid);
            fetchAPI = await (async signal => {
              Conversation.uuid = randomUUID().toString();
              Conversation.depth = 0;
              const res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations`, {
                signal,
                headers: {
                  ...AI.hdr(),
                  Cookie: getCookies()
                },
                method: 'POST',
                body: JSON.stringify({
                  uuid: Conversation.uuid,
                  name: ''
                })
              });
              updateParams(res);
              await checkResErr(res);
              return res;
            })(signal);
            type = 'r';
          }
        } else if (samePrompt) { } else {
          const systemExperiment = !Config.Settings.RenewAlways && Config.Settings.SystemExperiments;
          if (!systemExperiment || systemExperiment && Conversation.depth >= Config.SystemInterval) {
            type = 'c-r';
            Conversation.depth = 0;
          } else {
            type = 'c-c';
            Conversation.depth++;
          }
        }
        let { prompt, systems } = ((messages, type) => {
          const rgxScenario = /^\[Circumstances and context of the dialogue: ([\s\S]+?)\.?\]$/i, rgxPerson = /^\[([\s\S]+?)'s personality: ([\s\S]+?)\]$/i, messagesClone = JSON.parse(JSON.stringify(messages)), realLogs = messagesClone.filter((message => ['user', 'assistant'].includes(message.role))), sampleLogs = messagesClone.filter((message => message.name)), mergedLogs = [...sampleLogs, ...realLogs];
          mergedLogs.forEach(((message, idx) => {
            const next = mergedLogs[idx + 1];
            message.customname = (message => ['assistant', 'user'].includes(message.role) && null != message.name && !(message.name in Replacements))(message);
            if (next && !Config.Settings.xmlPlot) { //if (next) {
              if ('name' in message && 'name' in next) {
                if (message.name === next.name) {
                  message.content += '\n' + next.content;
                  next.merged = true;
                }
              } else if ('system' !== next.role) {
                if (next.role === message.role) {
                  message.content += '\n' + next.content;
                  next.merged = true;
                }
              } else {
                message.content += '\n' + next.content;
                next.merged = true;
              }
            }
          }));
          const lastAssistant = realLogs.findLast((message => !message.merged && 'assistant' === message.role));
          lastAssistant && Config.Settings.StripAssistant && (lastAssistant.strip = true);
          const lastUser = realLogs.findLast((message => !message.merged && 'user' === message.role));
          lastUser && Config.Settings.StripHuman && (lastUser.strip = true);
          const systemMessages = messagesClone.filter((message => 'system' === message.role && !('name' in message)));
          systemMessages.forEach(((message, idx) => {
            const scenario = message.content.match(rgxScenario)?.[1], personality = message.content.match(rgxPerson);
            if (scenario) {
              message.content = Config.ScenarioFormat.replace(/{{scenario}}/gim, scenario);
              message.scenario = true;
            }
            if (3 === personality?.length) {
              message.content = Config.PersonalityFormat.replace(/{{char}}/gim, personality[1]).replace(/{{personality}}/gim, personality[2]);
              message.personality = true;
            }
            message.main = 0 === idx;
            message.jailbreak = idx === systemMessages.length - 1;
            ' ' === message.content && (message.discard = true);
          }));
          Config.Settings.AllSamples && !Config.Settings.NoSamples && realLogs.forEach((message => {
            if (![lastUser, lastAssistant].includes(message)) {
              if ('user' === message.role) {
                message.name = message.customname ? message.name : 'example_user';
                message.role = 'system';
              } else if ('assistant' === message.role) {
                message.name = message.customname ? message.name : 'example_assistant';
                message.role = 'system';
              } else if (!message.customname) {
                throw Error('Invalid role ' + message.name);
              }
            }
          }));
          Config.Settings.NoSamples && !Config.Settings.AllSamples && sampleLogs.forEach((message => {
            if ('example_user' === message.name) {
              message.role = 'user';
            } else if ('example_assistant' === message.name) {
              message.role = 'assistant';
            } else if (!message.customname) {
              throw Error('Invalid role ' + message.name);
            }
            message.customname || delete message.name;
          }));
          let systems = [];
          if (!['r', 'R', 'api'].includes(type)) {
            lastUser.strip = true;
            systemMessages.forEach((message => message.discard = message.discard || 'c-c' === type ? !message.jailbreak : !message.jailbreak && !message.main));
            systems = systemMessages.filter((message => !message.discard)).map((message => `"${message.content.substring(0, 25).replace(/\n/g, '\\n').trim()}..."`));
            messagesClone.forEach((message => message.discard = message.discard || mergedLogs.includes(message) && ![lastUser].includes(message)));
          }
          const prompt = messagesClone.map(((message, idx) => {
            if (message.merged || message.discard) {
              return '';
            }
            if (message.content.length < 1) {
              return message.content;
            }
            let spacing = '';
            /******************************** */
            if (Config.Settings.xmlPlot) {
              idx > 0 && (spacing = '\n\n');
              const prefix = message.customname ? message.role + ': ' + message.name.replaceAll('_', ' ') + ': ' : 'system' !== message.role || message.name ? Replacements[message.name || message.role] + ': ' : 'xmlPlot: ' + Replacements[message.role];
              return `${spacing}${message.strip ? '' : prefix}${message.content}`;
            } else {
              /******************************** */
              idx > 0 && (spacing = systemMessages.includes(message) ? '\n' : '\n\n');
              const prefix = message.customname ? message.name.replaceAll('_', ' ') + ': ' : 'system' !== message.role || message.name ? Replacements[message.name || message.role] + ': ' : '' + Replacements[message.role];
              return `${spacing}${message.strip ? '' : prefix}${'system' === message.role ? message.content : message.content.trim()}`;
            } //
          }));
          return {
            prompt: prompt.join(''), //genericFixes(prompt.join('')).trim(),
            systems
          };
        })(messages, type);
        /******************************** */
        const legacy = /claude-([12]|instant)/i.test(model), messagesAPI = thirdKey || !legacy && !/<\|completeAPI\|>/.test(prompt) || /<\|messagesAPI\|>/.test(prompt), messagesLog = /<\|messagesLog\|>/.test(prompt), fusion = apiKey && messagesAPI && /<\|Fusion Mode\|>/.test(prompt), wedge = '\r';
        const stopSet = /<\|stopSet *(\[.*?\]) *\|>/.exec(prompt)?.[1], stopRevoke = /<\|stopRevoke *(\[.*?\]) *\|>/.exec(prompt)?.[1];
        if (stop_sequences || stopSet || stopRevoke) stop_sequences = JSON.parse(stopSet || '[]').concat(stop_sequences).concat(['\n\nHuman:', '\n\nAssistant:']).filter(item => !JSON.parse(stopRevoke || '[]').includes(item) && item);
        apiKey && (type = oaiAPI ? 'oai_api' : messagesAPI ? 'msg_api' : type);
        prompt = Config.Settings.xmlPlot ? xmlPlot(prompt, legacy && !/claude-2\.1/i.test(model)) : apiKey ? `\n\nHuman: ${genericFixes(prompt)}\n\nAssistant:` : genericFixes(prompt).trim();
        Config.Settings.FullColon && (prompt = !legacy ?
          prompt.replace(fusion ? /\n(?!\nAssistant:\s*$)(?=\n(Human|Assistant):)/gs : apiKey ? /(?<!\n\nHuman:.*)\n(?=\nAssistant:)|\n(?=\nHuman:)(?!.*\n\nAssistant:)/gs : /\n(?=\n(Human|Assistant):)/g, '\n' + wedge) :
          prompt.replace(fusion ? /(?<=\n\nAssistant):(?!\s*$)|(?<=\n\nHuman):/gs : apiKey ? /(?<!\n\nHuman:.*)(?<=\n\nAssistant):|(?<=\n\nHuman):(?!.*\n\nAssistant:)/gs : /(?<=\n\n(Human|Assistant)):/g, '﹕'));
        /******************************** */
        console.log(`${model} [[2m${type}[0m]${!retryRegen && systems.length > 0 ? ' ' + systems.join(' [33m/[0m ') : ''}`);
        'R' !== type || prompt || (prompt = '...regen...');
        Logger?.write(`\n\n-------\n[${(new Date).toLocaleString()}]\n${Main}\n####### ${model} (${type})\n${JSON.stringify({ FusionMode: fusion, PassParams: Config.Settings.PassParams, stop_sequences, top_k, top_p }, null, 2)}\n\n####### regex:\n${regexLog}\n####### PROMPT ${tokens}t:\n${prompt}\n--\n####### REPLY:\n`); //Logger?.write(`\n\n-------\n[${(new Date).toLocaleString()}]\n####### MODEL: ${model}\n####### PROMPT (${type}):\n${prompt}\n--\n####### REPLY:\n`);
        retryRegen || (fetchAPI = await (async (signal, model, prompt, type) => {
          /******************************** */
          if (apiKey) {
            let messages, system, key = apiKey[Math.floor(Math.random() * apiKey.length)];
            if (messagesAPI) {
              const rounds = prompt.replace(/^(?!.*\n\nHuman:)/s, '\n\nHuman:').split('\n\nHuman:');
              messages = rounds.slice(1).flatMap(round => {
                const turns = round.split('\n\nAssistant:');
                return [{ role: 'user', content: turns[0].trim() }].concat(turns.slice(1).flatMap(turn => [{ role: 'assistant', content: turn.trim() }]));
              }).reduce((acc, current) => {
                if (Config.Settings.FullColon && acc.length > 0 && (acc[acc.length - 1].role === current.role || !acc[acc.length - 1].content)) {
                  acc[acc.length - 1].content += (current.role === 'user' ? 'Human' : 'Assistant').replace(/.*/, legacy ? '\n$&﹕ ' : '\n' + wedge + '\n$&: ') + current.content;
                } else acc.push(current);
                return acc;
              }, []).filter(message => message.content), oaiAPI ? messages.unshift({ role: 'system', content: rounds[0].trim() }) : system = rounds[0].trim();
              messagesLog && console.log({ system, messages });
            }
            const res = await fetch('https://api.anthropic.com' + (oaiAPI ? '/chat/completions' : messagesAPI ? '/messages' : '/complete'), {
              method: 'POST',
              signal,
              headers: {
                'anthropic-version': '2024-10-22',
                'authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
                'User-Agent': AI.agent(),
                'x-api-key': key,
              },
              body: JSON.stringify({
                ...oaiAPI || messagesAPI ? {
                  max_tokens: max_tokens_to_sample,
                  messages,
                  system
                } : {
                  max_tokens_to_sample,
                  prompt
                },
                model,
                stop_sequences,
                stream: true,
                top_k,
                top_p
              }),
            });
            await checkResErr(res);
            return res;
          }
          /******************************** */
          const attachments = [];
          if (Config.Settings.PromptExperiments) {
            let splitedprompt = prompt.split('\n\nPlainPrompt:'); //
            prompt = splitedprompt[0]; //
            attachments.push({
              extracted_content: prompt,
              file_name: 'paste.txt',  //fileName(),
              file_type: 'txt', //'text/plain',
              file_size: Buffer.from(prompt).byteLength
            });
            prompt = 'r' === type ? Config.PromptExperimentFirst : Config.PromptExperimentNext;
            splitedprompt.length > 1 && (prompt += splitedprompt[1]); //
          }
          let res;
          const body = {
            attachments,
            files: [],
            model: isPro || forceModel ? model : undefined,
            rendering_mode: 'raw',
            ...Config.Settings.PassParams && {
              max_tokens_to_sample, //
              //stop_sequences, //
              top_k, //
              top_p, //
            },
            prompt: prompt || '',
            timezone: AI.zone()
          };
          let headers = {
            ...AI.hdr(Conversation.uuid || ''),
            Accept: 'text/event-stream',
            Cookie: getCookies()
          };
          res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg || ''}/chat_conversations/${Conversation.uuid || ''}/completion`, {
            stream: true,
            signal,
            method: 'POST',
            body: JSON.stringify(body),
            headers
          });
          updateParams(res);
          await checkResErr(res);
          return res;
        })(signal, model, prompt, type));
        const response = Writable.toWeb(res);
        clewdStream = new ClewdStream({
          config: {
            ...Config,
            Settings: {
              ...Config.Settings,
              Superfetch: apiKey ? false : Config.Settings.Superfetch
            }
          }, //config: Config,
          version: Main,
          minSize: Config.BufferSize,
          model,
          streaming: true === body.stream,
          abortControl,
          source: fetchAPI
        }, Logger);
        titleTimer = setInterval((() => setTitle('recv ' + bytesToSize(clewdStream.size))), 300);
        // 创建收集数据的函数
        async function collectData (readableStream) {
          const reader = readableStream.getReader();
          let collectedContent = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done || typeof value === 'string') break;

              // 假设数据是文本格式,如果是二进制需要相应调整
              const o = JSON.parse(new TextDecoder().decode(value).replace('data: ', ''))
              collectedContent += o.choices[0].delta.content;

            }
          } finally {
            reader.releaseLock();
          }

          // 将收集到的数据格式化为 OpenAI API 的响应格式
          return JSON.stringify({
            id: 'chatcmpl-' + randomUUID(),
            object: 'chat.completion',
            created: Date.now(),
            model: model,
            choices: [{
              message: {
                role: 'assistant',
                content: collectedContent.trim()
              },
              finish_reason: 'stop',
              index: 0
            }]
          });
        }

        // 修改管道处理响应的部分
        let streamThrough;
        if (!apiKey && Config.Settings.Superfetch) {
          streamThrough = await Readable.toWeb(fetchAPI.body).pipeThrough(clewdStream);
        } else {
          streamThrough = await fetchAPI.body.pipeThrough(clewdStream);
        }

        // 收集完整数据后一次性返回
        const responseData = {
          ...JSON.parse(await collectData(streamThrough)),
          organizationId: uuidOrg,
          conversationId: Conversation.uuid  // 返回会话ID
        };

        // 设置响应头
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });

        // 发送完整响应
        res.end(JSON.stringify(responseData));
      } catch (err) {
        if ('AbortError' === err.name) {
          res.end();
        } else {
          nochange = true, exceeded_limit = err.exceeded_limit; //
          err.planned ? console.log(`[33m${err.status || 'Aborted'}![0m\n`) : console.error('[33mClewd:[0m\n%o', err); //err.planned || console.error('[33mClewd:[0m\n%o', err);
          res.json({
            error: {
              message: 'clewd: ' + (err.message || err.name || err.type),
              type: err.type || err.name || err.code,
              param: null,
              code: err.code || 500
            }
          }, 500);
        }
      }
      clearInterval(titleTimer);
      if (clewdStream) {
        clewdStream.censored && console.warn('[33mlikely your account is hard-censored[0m');
        prevImpersonated = clewdStream.impersonated;
        exceeded_limit = clewdStream.error.exceeded_limit; //
        clewdStream.error.status < 200 || clewdStream.error.status >= 300 || clewdStream.error.message === 'Overloaded' && (nochange = true); //
        setTitle('ok ' + bytesToSize(clewdStream.size));
        if (clewdStream.compModel && !(AI.mdl().includes(clewdStream.compModel) || Config.unknownModels.includes(clewdStream.compModel)) && !apiKey) {
          Config.unknownModels.push(clewdStream.compModel);
          writeSettings(Config);
        }
        console.log(`${200 == fetchAPI.status ? '[32m' : '[33m'}${fetchAPI.status}![0m\n`);
        clewdStream.empty();
      }
      const shouldChange = exceeded_limit || !nochange && Config.Cookiecounter > 0 && changeflag++ >= Config.Cookiecounter - 1; //
      if (!apiKey && (shouldChange || prevImpersonated)) { //if (prevImpersonated) {
        try {
          // await deleteChat(Conversation.uuid);
        } catch (err) { }
        /******************************** */
        if (shouldChange) {
          exceeded_limit && console.log(`[35mExceeded limit![0m\n`);
          changeflag = 0;
          CookieChanger();
        }
        /******************************** */
      }
    }));
  })(req, res);