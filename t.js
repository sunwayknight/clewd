const handleChatCompletions = (req, res) => {
  setTitle('recv...');
  let fetchAPI;
  const abortControl = new AbortController();
  const { signal } = abortControl;
  
  // 监听连接关闭
  res.socket.on('close', async () => {
    abortControl.signal.aborted || abortControl.abort();
  });

  // 收集请求数据
  const buffer = [];
  req.on('data', chunk => buffer.push(chunk));
  
  req.on('end', async () => {
    let clewdStream, titleTimer, samePrompt = false, shouldRenew = true;
    let retryRegen = false, exceeded_limit = false, nochange = false;

    try {
      const body = JSON.parse(Buffer.concat(buffer).toString());
      let { messages, conversationId } = body;

      // 处理会话ID
      if (conversationId) {
        Conversation.uuid = conversationId;
      }

      // 处理API密钥和模型
      const thirdKey = req.headers.authorization?.match(/(?<=(3rd|oai)Key:).*/);
      const oaiAPI = /oaiKey:/.test(req.headers.authorization);
      const forceModel = /--force/.test(body.model);
      
      apiKey = thirdKey?.[0].split(',').map(item => item.trim()) || 
               req.headers.authorization?.match(/sk-ant-api\d\d-[\w-]{86}-[\w-]{6}AA/g);
      model = apiKey || forceModel || isPro ? body.model.replace(/--force/, '').trim() : cookieModel;
      
      let max_tokens_to_sample = body.max_tokens;
      let stop_sequences = body.stop;
      let top_p = typeof body.top_p === 'number' ? body.top_p : undefined;
      let top_k = typeof body.top_k === 'number' ? body.top_k : undefined;

      // 验证API密钥或Cookie
      if (!apiKey && !uuidOrg) {
        throw Error('No cookie available or apiKey format wrong');
      } else if (!changing && !apiKey && (!isPro && model != cookieModel)) {
        CookieChanger();
      }

      await waitForChange();

      // 验证消息
      if (messages?.length < 1) {
        throw Error('请传入messages');
      }

      // 处理特殊消息
      if (!body.stream && messages.length === 1 && 
          JSON.stringify(messages.sort()) === JSON.stringify([{
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

      // 设置响应头
      res.setHeader('Access-Control-Allow-Origin', '*');
      body.stream && res.setHeader('Content-Type', 'text/event-stream');

      // ... 后续代码将在下一部分展示
      // 继续之前的 try 块内容

      // 特殊消息处理
      if (!body.stream && messages?.[0]?.content?.startsWith(
        'From the list below, choose a word that best represents a character\'s outfit description, action, or emotion in their dialogue'
      )) {
        return res.json({
          choices: [{
            message: {
              content: 'neutral'
            }
          }]
        });
      }

      // 验证设置配置
      if (Config.Settings.AllSamples && Config.Settings.NoSamples) {
        console.log('[33mhaving[0m [1mAllSamples[0m and [1mNoSamples[0m both set to true is not supported');
        throw Error('Only one can be used at the time: AllSamples/NoSamples');
      }

      // 模型验证
      if (!modelList.includes(model) && !/claude-.*/.test(model) && !forceModel) {
        throw Error('Invalid model selected: ' + model);
      }

      // 构建当前提示对象
      curPrompt = {
        firstUser: messages.find(message => 'user' === message.role),
        firstSystem: messages.find(message => 'system' === message.role),
        firstAssistant: messages.find(message => 'assistant' === message.role),
        lastUser: messages.findLast(message => 'user' === message.role),
        lastSystem: messages.findLast(message => 'system' === message.role && '[Start a new chat]' !== message.content),
        lastAssistant: messages.findLast(message => 'assistant' === message.role)
      };

      // 构建前一个提示对象
      prevPrompt = {
        ...prevMessages.length > 0 && {
          firstUser: prevMessages.find(message => 'user' === message.role),
          firstSystem: prevMessages.find(message => 'system' === message.role),
          firstAssistant: prevMessages.find(message => 'assistant' === message.role),
          lastUser: prevMessages.findLast(message => 'user' === message.role),
          lastSystem: prevMessages.find(message => 'system' === message.role && '[Start a new chat]' !== message.content),
          lastAssistant: prevMessages.findLast(message => 'assistant' === message.role)
        }
      };

      // 检查是否相同提示
      samePrompt = JSON.stringify(messages.filter(message => 'system' !== message.role).sort()) === 
                   JSON.stringify(prevMessages.filter(message => 'system' !== message.role).sort());

      // 检查是否相同角色不同聊天
      const sameCharDiffChat = !samePrompt && 
                              curPrompt.firstSystem?.content === prevPrompt.firstSystem?.content && 
                              curPrompt.firstUser?.content !== prevPrompt.firstUser?.content;

      // 确定是否需要更新
      shouldRenew = Config.Settings.RenewAlways || 
                   !Conversation.uuid || 
                   prevImpersonated || 
                   !Config.Settings.RenewAlways && samePrompt || 
                   sameCharDiffChat;

      // 确定是否需要重试生成
      retryRegen = Config.Settings.RetryRegenerate && samePrompt && null != Conversation.uuid;

      // 更新前一个消息记录
      samePrompt || (prevMessages = JSON.parse(JSON.stringify(messages)));

      // 确定请求类型
      let type = '';
      if (apiKey) { 
        type = 'api'; 
      } else if (retryRegen) {
        type = 'R';
        fetchAPI = await handleRetryGeneration(signal, model);
      } else if (shouldRenew) {
        if (conversationId) {
          type = 'c';
        } else {
          // 删除旧会话并创建新会话
          Conversation.uuid && await deleteChat(Conversation.uuid);
          fetchAPI = await createNewConversation(signal);
          type = 'r';
        }
      } else if (samePrompt) {
        // 保持当前状态
      } else {
        const systemExperiment = !Config.Settings.RenewAlways && Config.Settings.SystemExperiments;
        if (!systemExperiment || systemExperiment && Conversation.depth >= Config.SystemInterval) {
          type = 'c-r';
          Conversation.depth = 0;
        } else {
          type = 'c-c';
          Conversation.depth++;
        }
      }

      // 处理消息并生成提示
      let { prompt, systems } = processMessages(messages, type);

      // ... 后续的API请求构建和响应处理代码将在下一部分展示
      // 处理legacy和消息API相关配置
      const legacy = /claude-([12]|instant)/i.test(model);
      const messagesAPI = thirdKey || !legacy && !/<\|completeAPI\|>/.test(prompt) || /<\|messagesAPI\|>/.test(prompt);
      const messagesLog = /<\|messagesLog\|>/.test(prompt);
      const fusion = apiKey && messagesAPI && /<\|Fusion Mode\|>/.test(prompt);
      const wedge = '\r';

      // 处理停止序列
      const stopSet = /<\|stopSet *(\[.*?\]) *\|>/.exec(prompt)?.[1];
      const stopRevoke = /<\|stopRevoke *(\[.*?\]) *\|>/.exec(prompt)?.[1];
      if (stop_sequences || stopSet || stopRevoke) {
        stop_sequences = JSON.parse(stopSet || '[]')
          .concat(stop_sequences)
          .concat(['\n\nHuman:', '\n\nAssistant:'])
          .filter(item => !JSON.parse(stopRevoke || '[]').includes(item) && item);
      }

      // 更新类型和处理提示
      apiKey && (type = oaiAPI ? 'oai_api' : messagesAPI ? 'msg_api' : type);
      
      prompt = Config.Settings.xmlPlot ? 
        xmlPlot(prompt, legacy && !/claude-2\.1/i.test(model)) : 
        apiKey ? 
          `\n\nHuman: ${genericFixes(prompt)}\n\nAssistant:` : 
          genericFixes(prompt).trim();

      // 处理全角冒号
      if (Config.Settings.FullColon) {
        prompt = !legacy ?
          prompt.replace(
            fusion ? 
              /\n(?!\nAssistant:\s*$)(?=\n(Human|Assistant):)/gs : 
              apiKey ? 
                /(?<!\n\nHuman:.*)\n(?=\nAssistant:)|\n(?=\nHuman:)(?!.*\n\nAssistant:)/gs : 
                /\n(?=\n(Human|Assistant):)/g, 
            '\n' + wedge
          ) :
          prompt.replace(
            fusion ? 
              /(?<=\n\nAssistant):(?!\s*$)|(?<=\n\nHuman):/gs : 
              apiKey ? 
                /(?<!\n\nHuman:.*)(?<=\n\nAssistant):|(?<=\n\nHuman):(?!.*\n\nAssistant:)/gs : 
                /(?<=\n\n(Human|Assistant)):/g, 
            '﹕'
          );
      }

      // 输出日志信息
      console.log(`${model} [[2m${type}[0m]${!retryRegen && systems.length > 0 ? ' ' + systems.join(' [33m/[0m ') : ''}`);
      
      'R' !== type || prompt || (prompt = '...regen...');
      
      // 写入日志
      Logger?.write(
        `\n\n-------\n[${(new Date).toLocaleString()}]\n${Main}\n####### ${model} (${type})\n${
          JSON.stringify({ FusionMode: fusion, PassParams: Config.Settings.PassParams, stop_sequences, top_k, top_p }, null, 2)
        }\n\n####### regex:\n${regexLog}\n####### PROMPT ${tokens}t:\n${prompt}\n--\n####### REPLY:\n`
      );

      // 构建API请求
      retryRegen || (fetchAPI = await (async (signal, model, prompt, type) => {
        if (apiKey) {
          let messages, system, key = apiKey[Math.floor(Math.random() * apiKey.length)];
          if (messagesAPI) {
            const rounds = prompt.replace(/^(?!.*\n\nHuman:)/s, '\n\nHuman:').split('\n\nHuman:');
            messages = rounds.slice(1).flatMap(round => {
              const turns = round.split('\n\nAssistant:');
              return [
                { role: 'user', content: turns[0].trim() }
              ].concat(
                turns.slice(1).flatMap(turn => [
                  { role: 'assistant', content: turn.trim() }
                ])
              );
            }).reduce((acc, current) => {
              if (Config.Settings.FullColon && acc.length > 0 && 
                 (acc[acc.length - 1].role === current.role || !acc[acc.length - 1].content)) {
                acc[acc.length - 1].content += 
                  (current.role === 'user' ? 'Human' : 'Assistant')
                    .replace(/.*/, legacy ? '\n$&﹕ ' : '\n' + wedge + '\n$&: ') + 
                  current.content;
              } else acc.push(current);
              return acc;
            }, []).filter(message => message.content);

            oaiAPI ? 
              messages.unshift({ role: 'system', content: rounds[0].trim() }) : 
              system = rounds[0].trim();
              
            messagesLog && console.log({ system, messages });
          }

          // 发送第三方API请求
          const res = await fetch('https://api.anthropic.com' + 
            (oaiAPI ? '/chat/completions' : messagesAPI ? '/messages' : '/complete'), {
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
              ...(oaiAPI || messagesAPI ? {
                max_tokens: max_tokens_to_sample,
                messages,
                system
              } : {
                max_tokens_to_sample,
                prompt
              }),
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

        // ... 下一部分将继续展示非API请求的处理逻辑
        // 继续上一部分的 async 函数内容
        // 处理非API请求的情况
        const attachments = [];
        if (Config.Settings.PromptExperiments) {
          let splitedprompt = prompt.split('\n\nPlainPrompt:');
          prompt = splitedprompt[0];
          attachments.push({
            extracted_content: prompt,
            file_name: 'paste.txt',
            file_type: 'txt',
            file_size: Buffer.from(prompt).byteLength
          });
          prompt = 'r' === type ? Config.PromptExperimentFirst : Config.PromptExperimentNext;
          splitedprompt.length > 1 && (prompt += splitedprompt[1]);
        }

        // 构建请求体
        const body = {
          attachments,
          files: [],
          model: isPro || forceModel ? model : undefined,
          rendering_mode: 'raw',
          ...Config.Settings.PassParams && {
            max_tokens_to_sample,
            top_k,
            top_p,
          },
          prompt: prompt || '',
          timezone: AI.zone()
        };

        // 构建请求头
        let headers = {
          ...AI.hdr(Conversation.uuid || ''),
          Accept: 'text/event-stream',
          Cookie: getCookies()
        };

        // 发送请求
        const res = await (Config.Settings.Superfetch ? Superfetch : fetch)(
          `${Config.rProxy || AI.end()}/api/organizations/${uuidOrg || ''}/chat_conversations/${Conversation.uuid || ''}/completion`,
          {
            stream: true,
            signal,
            method: 'POST',
            body: JSON.stringify(body),
            headers
          }
        );

        updateParams(res);
        await checkResErr(res);
        return res;
      })(signal, model, prompt, type));

      // 创建响应流
      const response = Writable.toWeb(res);
      clewdStream = new ClewdStream({
        config: {
          ...Config,
          Settings: {
            ...Config.Settings,
            Superfetch: apiKey ? false : Config.Settings.Superfetch
          }
        },
        version: Main,
        minSize: Config.BufferSize,
        model,
        streaming: true === body.stream,
        abortControl,
        source: fetchAPI
      }, Logger);

      // 设置标题更新定时器
      titleTimer = setInterval(() => setTitle('recv ' + bytesToSize(clewdStream.size)), 300);

      // 处理响应流数据收集
      async function collectData(readableStream) {
        const reader = readableStream.getReader();
        let collectedContent = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || typeof value === 'string') break;

            const o = JSON.parse(new TextDecoder().decode(value).replace('data: ', ''));
            collectedContent += o.choices[0].delta.content;
          }
        } finally {
          reader.releaseLock();
        }

        // 格式化响应数据
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

      // 处理流式响应
      let streamThrough;
      if (!apiKey && Config.Settings.Superfetch) {
        streamThrough = await Readable.toWeb(fetchAPI.body).pipeThrough(clewdStream);
      } else {
        streamThrough = await fetchAPI.body.pipeThrough(clewdStream);
      }

      // 收集完整响应数据
      const responseData = {
        ...JSON.parse(await collectData(streamThrough)),
        organizationId: uuidOrg,
        conversationId: Conversation.uuid
      };

      // 设置响应头并发送数据
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });

      res.end(JSON.stringify(responseData));

      // ... 错误处理和清理代码将在下一部分展示
    
    } catch (err) {
      // 错误处理
      if ('AbortError' === err.name) {
        res.end();
      } else {
        nochange = true;
        exceeded_limit = err.exceeded_limit;
        err.planned ? 
          console.log(`[33m${err.status || 'Aborted'}![0m\n`) : 
          console.error('[33mClewd:[0m\n%o', err);
        
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

    // 清理工作
    clearInterval(titleTimer);
    
    if (clewdStream) {
      // 检查审查状态
      clewdStream.censored && console.warn('[33mlikely your account is hard-censored[0m');
      
      // 更新状态
      prevImpersonated = clewdStream.impersonated;
      exceeded_limit = clewdStream.error.exceeded_limit;
      clewdStream.error.status < 200 || clewdStream.error.status >= 300 || 
        clewdStream.error.message === 'Overloaded' && (nochange = true);

      // 更新标题
      setTitle('ok ' + bytesToSize(clewdStream.size));

      // 处理未知模型
      if (clewdStream.compModel && 
          !(AI.mdl().includes(clewdStream.compModel) || 
            Config.unknownModels.includes(clewdStream.compModel)) && 
          !apiKey) {
        Config.unknownModels.push(clewdStream.compModel);
        writeSettings(Config);
      }

      // 输出状态
      console.log(`${200 == fetchAPI.status ? '[32m' : '[33m'}${fetchAPI.status}![0m\n`);
      
      // 清空流
      clewdStream.empty();
    }

    // Cookie更换处理
    const shouldChange = exceeded_limit || !nochange && Config.Cookiecounter > 0 && 
                        changeflag++ >= Config.Cookiecounter - 1;
    
    if (!apiKey && (shouldChange || prevImpersonated)) {
      try {
        if (shouldChange) {
          exceeded_limit && console.log(`[35mExceeded limit![0m\n`);
          changeflag = 0;
          CookieChanger();
        }
      } catch (err) { 
        console.error('Cookie change error:', err);
      }
    }
  });
};

// 添加路由处理
((req, res) => {
  setTitle('recv...');
  const URL = url.parse(req.url.replace(/\/v1(\?.*)\$(\/.*)$/, '/v1$2$1'), true);
  req.url = URL.pathname;
  switch (req.url) {
    case '/v1/chat/completions':
      handleChatCompletions(req, res);
      break;
      
    case '/v1/chat/conversation':
      handleChatConversation(req, res);
      break;
      
    case '/v1/complete':
      res.json({
        error: {
          message: 'clewd: Set "Chat Completion source" to OpenAI instead of Claude. Enable "External" models aswell',
          code: 404
        }
      }, 404);
      break;
      
    default:
      console.log('hello world', req.url);
      res.json({
        message: 'hello world',
        code: 200
      });
  }
})(req, res);