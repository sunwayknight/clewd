/*
* https://rentry.org/teralomaniac_clewd
* https://github.com/teralomaniac/clewd
*/
'use strict';

const { createServer: Server, IncomingMessage, ServerResponse } = require('node:http'), { createHash: Hash, randomUUID, randomInt, randomBytes } = require('node:crypto'), { TransformStream, ReadableStream } = require('node:stream/web'), { Readable, Writable } = require('node:stream'), { Blob } = require('node:buffer'), { existsSync: exists, writeFileSync: write, createWriteStream } = require('node:fs'), { join: joinP } = require('node:path'), { ClewdSuperfetch: Superfetch, SuperfetchAvailable, SuperfetchFoldersMk, SuperfetchFoldersRm } = require('./lib/clewd-superfetch'), { AI, fileName, genericFixes, bytesToSize, setTitle, checkResErr, Replacements, Main } = require('./lib/clewd-utils'), ClewdStream = require('./lib/clewd-stream');

/******************************************************* */
let currentIndex, Firstlogin = true, changeflag = 0, changing, changetime = 0, totaltime, uuidOrgArray = [], model, cookieModel, tokens, timestamp, regexLog, isPro, modelList = [];

const url = require('url');
const asyncPool = async (poolLimit, array, iteratorFn) => {
  const ret = [], executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

const convertToType = value => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value);
  return value;
}
const CookieChanger = (resetTimer = true, cleanup = false) => {
  if (Config.CookieArray?.length <= 1) {
    return changing = false;
  } else {
    changeflag = 0, changing = true;
    if (!cleanup) {
      currentIndex = (currentIndex + 1) % Config.CookieArray.length;
      console.log(`Changing Cookie...\n`);
    }
    setTimeout(() => {
      onListen();
      resetTimer && (timestamp = Date.now());
    }, !Config.rProxy || Config.rProxy === AI.end() ? 15000 + timestamp - Date.now() : 0);
  }
}
const CookieCleaner = (flag, percentage) => {
  Config.WastedCookie.push(flag + '@' + Config.CookieArray[currentIndex].split('@').toReversed()[0]);
  Config.CookieArray.splice(currentIndex, 1), Config.Cookie = '';
  Config.Cookiecounter < 0 && console.log(`[progress]: [32m${percentage.toFixed(2)}%[0m\n[length]: [33m${Config.CookieArray.length}[0m\n`);
  console.log(`Cleaning Cookie...\n`);
  writeSettings(Config);
  return CookieChanger(true, true);
}

const waitForChange = () => {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (!changing) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
};
/******************************************************* */

let ChangedSettings, UnknownSettings, Logger;

const ConfigPath = joinP(__dirname, './config.js'), LogPath = joinP(__dirname, './log.txt'), Conversation = {
  char: null,
  uuid: null,
  depth: 0
}

let cookies = {};
let uuidOrg
let Config = {
  Cookie: '',
  CookieArray: [],
  WastedCookie: [],
  unknownModels: [],
  Cookiecounter: 3,
  CookieIndex: 0,
  Ip: '0.0.0.0',
  Port: process.env.PORT || 42819,
  localtunnel: false,
  BufferSize: 1,
  SystemInterval: 3,
  rProxy: '',
  Settings: {
    RenewAlways: true,
    RetryRegenerate: false,
    ClearFlags: true,
    PreserveChats: false,
    LogMessages: true,
    SkipRestricted: false,
    Artifacts: false,
    Superfetch: true
  }
};

ServerResponse.prototype.json = async function (body, statusCode = 200, headers) {
  body = body instanceof Promise ? await body : body;
  this.headersSent || this.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...headers && headers
  });
  this.end('object' == typeof body ? JSON.stringify(body) : body);
  return this;
};

Array.prototype.sample = function () {
  return this[Math.floor(Math.random() * this.length)];
};

const updateParams = res => {
  updateCookies(res);
}

const updateCookies = res => {
  let cookieNew = '';
  res instanceof Response ? cookieNew = res.headers?.get('set-cookie') : res?.superfetch ? cookieNew = res.headers?.['set-cookie'] : 'string' == typeof res && (cookieNew = res.split('\n').join(''));
  if (!cookieNew) {
    return;
  }
  let cookieArr = cookieNew.split(/;\s?/gi).filter((prop => false === /^(path|expires|domain|HttpOnly|Secure|SameSite)[=;]*/i.test(prop)));
  for (const cookie of cookieArr) {
    const divide = cookie.split(/^(.*?)=\s*(.*)/), cookieName = divide[1], cookieVal = divide[2];
    cookies[cookieName] = cookieVal;
  }
}

const getCookies = () => {
  const cookieNames = Object.keys(cookies);
  return cookieNames.map(((name, idx) => `${name}=${cookies[name]}${idx === cookieNames.length - 1 ? '' : ';'}`)).join(' ').replace(/(\s+)$/gi, '');
}

const deleteChat = async uuid => {
  if (!uuid) {
    return;
  }
  if (uuid === Conversation.uuid) {
    Conversation.uuid = null;
    Conversation.depth = 0;
  }
  if (Config.Settings.PreserveChats) {
    return;
  }
  const res = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations/${uuid}`, {
    headers: {
      ...AI.hdr(),
      Cookie: getCookies()
    },
    method: 'DELETE'
  });
  updateParams(res);
}

const onListen = async () => {
  /***************************** */
  if (Firstlogin) {
    Firstlogin = false, timestamp = Date.now(), totaltime = Config.CookieArray.length;
    console.log(`[2m${Main}[0m\n[33mhttp://${Config.Ip}:${Config.Port}/v1[0m\n\n${Object.keys(Config.Settings).map((setting => UnknownSettings?.includes(setting) ? `??? [31m${setting}: ${Config.Settings[setting]}[0m` : `[1m${setting}:[0m ${ChangedSettings?.includes(setting) ? '[33m' : '[36m'}${Config.Settings[setting]}[0m`)).sort().join('\n')}\n`); //↓
    if (Config.Settings.Superfetch) {
      SuperfetchAvailable(true);
      SuperfetchFoldersMk();
    }
    if (Config.localtunnel) {
      const localtunnel = require('localtunnel');
      localtunnel({ port: Config.Port }).then((tunnel) => {
        console.log(`\nTunnel URL for outer websites: ${tunnel.url}/v1\n`);
      })
    }
  }
  if (Config.CookieArray?.length > 0) {
    const cookieInfo = /(?:(claude[-_][a-z0-9-_]*?)@)?(?:sessionKey=)?(sk-ant-sid01-[\w-]{86}-[\w-]{6}AA)/.exec(Config.CookieArray[currentIndex]);
    cookieInfo?.[2] && (Config.Cookie = 'sessionKey=' + cookieInfo[2]);
    changetime++;
    if (model && cookieInfo?.[1] && !/claude[\w]*?_pro/.test(cookieInfo?.[1]) && cookieInfo?.[1] != model) return CookieChanger(false);
  }
  let percentage = ((changetime + Math.max(Config.CookieIndex - 1, 0)) / totaltime) * 100
  if (Config.Cookiecounter < 0 && percentage > 100) {
    console.log(`\n※※※Cookie cleanup completed※※※\n\n`);
    return process.exit();
  }
  try {
    /***************************** */
    if ('SET YOUR COOKIE HERE' === Config.Cookie || Config.Cookie?.length < 1) {
      return changing = false, console.log(`[33mNo cookie available`); //throw Error('Set your cookie inside config.js');
    }
    updateCookies(Config.Cookie);
    /**************************** */
    const bootstrapRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/bootstrap`, {
      method: 'GET',
      headers: {
        ...AI.hdr(),
        Cookie: getCookies()
      }
    });
    await checkResErr(bootstrapRes);
    const bootstrap = await bootstrapRes.json();
    if (bootstrap.account === null) {
      console.log(`[35mNull![0m`);
      return CookieCleaner('Null', percentage);
    }
    const bootAccInfo = bootstrap.account.memberships.find(item => item.organization.capabilities.includes('chat')).organization;
    cookieModel = bootstrap.statsig.values.layer_configs["HPOHwBLNLQLxkj5Yn4bfSkgCQnBX28kPR7h/BNKdVLw="]?.value?.console_default_model_override?.model || bootstrap.statsig.values.dynamic_configs["6zA9wvTedwkzjLxWy9PVe7yydI00XDQ6L5Fejjq/2o8="]?.value?.model;
    isPro = bootAccInfo.capabilities.includes('claude_pro') && 'claude_pro' || bootAccInfo.capabilities.includes('raven') && 'claude_team_pro';
    const unknown = cookieModel && !(AI.mdl().includes(cookieModel) || Config.unknownModels.includes(cookieModel));
    if (Config.CookieArray?.length > 0 && (isPro || cookieModel) != Config.CookieArray[currentIndex].split('@')[0] || unknown) {
      Config.CookieArray[currentIndex] = (isPro || cookieModel) + '@' + Config.Cookie;
      unknown && Config.unknownModels.push(cookieModel);
      writeSettings(Config);
    }
    if (!isPro && model && model != cookieModel) return CookieChanger();
    console.log(Config.CookieArray?.length > 0 ? `(index: [36m${currentIndex + 1 || Config.CookieArray.length}[0m) Logged in %o` : 'Logged in %o', { //console.log('Logged in %o', { ↓
      name: bootAccInfo.name?.split('@')?.[0],
      mail: bootstrap.account.email_address, //
      cookieModel, //
      capabilities: bootAccInfo.capabilities
    }); //↓
    if (uuidOrgArray.includes(bootAccInfo.uuid) && percentage <= 100 && Config.CookieArray?.length > 0 || bootAccInfo.api_disabled_reason && !bootAccInfo.api_disabled_until || !bootstrap.account.completed_verification_at) {
      const flag = bootAccInfo.api_disabled_reason ? 'Disabled' : !bootstrap.account.completed_verification_at ? 'Unverified' : 'Overlap';
      console.log(`[31m${flag}![0m`);
      return CookieCleaner(flag, percentage);
    } else uuidOrgArray.push(bootAccInfo.uuid);
    if (Config.Cookiecounter < 0) {
      console.log(`[progress]: [32m${percentage.toFixed(2)}%[0m\n[length]: [33m${Config.CookieArray.length}[0m\n`);
      return CookieChanger();
    }
    /**************************** */
    const accRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + '/api/organizations', {
      method: 'GET',
      headers: {
        ...AI.hdr(),
        Cookie: getCookies()
      }
    });
    await checkResErr(accRes);
    const accInfo = (await accRes.json())?.find(item => item.capabilities.includes('chat')); //const accInfo = (await accRes.json())?.[0];\nif (!accInfo || accInfo.error) {\n    throw Error(`Couldn't get account info: "${accInfo?.error?.message || accRes.statusText}"`);\n}\nif (!accInfo?.uuid) {\n    throw Error('Invalid account id');\n}
    setTitle('ok');
    updateParams(accRes);
    console.log(accInfo, accInfo?.uuid)
    uuidOrg = accInfo?.uuid;
    if (accInfo?.active_flags.length > 0) {
      let banned = false; //
      const now = new Date, formattedFlags = accInfo.active_flags.map((flag => {
        const days = ((new Date(flag.expires_at).getTime() - now.getTime()) / 864e5).toFixed(2);
        'consumer_banned' === flag.type && (banned = true); //
        return {
          type: flag.type,
          remaining_days: days
        };
      }));
      console.warn(`${banned ? '[31m' : '[35m'}Your account has warnings[0m %o`, formattedFlags); //console.warn('[31mYour account has warnings[0m %o', formattedFlags);
      await Promise.all(accInfo.active_flags.map((flag => (async type => {
        if (!Config.Settings.ClearFlags) {
          return;
        }
        if ('consumer_restricted_mode' === type || 'consumer_banned' === type) { //if ('consumer_restricted_mode' === type) {
          return;
        }
        const req = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/flags/${type}/dismiss`, {
          headers: {
            ...AI.hdr(),
            Cookie: getCookies()
          },
          method: 'POST'
        });
        updateParams(req);
        const json = await req.json();
        console.log(`${type}: ${json.error ? json.error.message || json.error.type || json.detail : 'OK'}`);
      })(flag.type))));
      console.log(`${banned ? '[31mBanned' : '[35mRestricted'}![0m`); //
      if (banned) return CookieCleaner('Banned') //
      else if (Config.Settings.SkipRestricted) return CookieChanger(); //
    }
    if (bootstrap.account.settings.preview_feature_uses_artifacts != Config.Settings.Artifacts) {
      const settingsRes = await (Config.Settings.Superfetch ? Superfetch : fetch)((Config.rProxy || AI.end()) + `/api/account`, {
        method: 'PUT',
        headers: {
          ...AI.hdr(),
          Cookie: getCookies()
        },
        body: JSON.stringify({ settings: Object.assign(bootstrap.account.settings, { preview_feature_uses_artifacts: Config.Settings.Artifacts }) }),
      });
      await checkResErr(settingsRes);
      updateParams(settingsRes);
    }
    changing = false;
    const convRes = await (Config.Settings.Superfetch ? Superfetch : fetch)(`${Config.rProxy || AI.end()}/api/organizations/${accInfo.uuid}/chat_conversations`, { //const convRes = await fetch(`${Config.rProxy || AI.end()}/api/organizations/${uuidOrg}/chat_conversations`, {
      method: 'GET',
      headers: {
        ...AI.hdr(),
        Cookie: getCookies()
      }
    }), conversations = await convRes.json();
    updateParams(convRes);
    conversations.length > 0 && await asyncPool(10, conversations, async (conv) => await deleteChat(conv.uuid)); //await Promise.all(conversations.map((conv => deleteChat(conv.uuid))));
    /***************************** */
  } catch (err) {
    if (err.message === 'Invalid authorization') {
      console.log(`[31mInvalid![0m`);
      return CookieCleaner('Invalid', percentage);
    }
    console.error('[33mClewd:[0m\n%o', err);
    CookieChanger();
  }
  /***************************** */
}

const writeSettings = async (config, firstRun = false) => {
  if (process.env.Cookie || process.env.CookieArray) return; //
  write(ConfigPath, `/*\n* https://rentry.org/teralomaniac_clewd\n* https://github.com/teralomaniac/clewd\n*/\n\n// SET YOUR COOKIE BELOW\n\nmodule.exports = ${JSON.stringify(config, null, 4)}\n\n/*\n BufferSize\n * How many characters will be buffered before the AI types once\n * lower = less chance of \`PreventImperson\` working properly\n\n ---\n\n SystemInterval\n * How many messages until \`SystemExperiments alternates\`\n\n ---\n\n Other settings\n * https://gitgud.io/ahsk/clewd/#defaults\n * and\n * https://gitgud.io/ahsk/clewd/-/blob/master/CHANGELOG.md\n */`.trim().replace(/((?<!\r)\n|\r(?!\n))/g, '\r\n'));
  if (firstRun) {
    console.warn('[33mconfig file created!\nedit[0m [1mconfig.js[0m [33mto set your settings and restart the program[0m');
    process.exit(0);
  }
}

const Proxy = Server((async (req, res) => {
  if ('OPTIONS' === req.method) {
    return ((req, res) => {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      }).end();
    })(0, res);
  }
  const URL = url.parse(req.url.replace(/\/v1(\?.*)\$(\/.*)$/, '/v1$2$1'), true);
  req.url = URL.pathname;
  switch (req.url) {
    case '/v1/chat/completions':
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
        let titleTimer
        let exceeded_limit = false
        let nochange = false;

        try {
          const body = JSON.parse(Buffer.concat(buffer).toString());
          let { messages, conversationId } = body;
          Conversation.uuid = conversationId;
          /************************* */
          const forceModel = /--force/.test(body.model);
          model = forceModel || isPro ? body.model.replace(/--force/, '').trim() : cookieModel;
          let max_tokens_to_sample = body.max_tokens
          let top_p = typeof body.top_p === 'number' ? body.top_p : undefined
          let top_k = typeof body.top_k === 'number' ? body.top_k : undefined;
          // 没有组织ID时,抛出错误提示
          if (!uuidOrg) {
            throw Error('No cookie available to get uuid');
          } else if (!changing && (!isPro && model != cookieModel)) {
            CookieChanger();
          }
          await waitForChange();
          /************************* */

          if (messages?.length < 1) {
            throw Error('请传入messages');
          }
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (Config.Settings.AllSamples && Config.Settings.NoSamples) {
            console.log('[33mhaving[0m [1mAllSamples[0m and [1mNoSamples[0m both set to true is not supported');
            throw Error('Only one can be used at the same time: AllSamples/NoSamples');
          }
          //const model = body.model;//if (model === AI.mdl()[0]) {//    return;//}
          if (!modelList.includes(model) && !/claude-.*/.test(model) && !forceModel) {
            throw Error('Invalid model selected: ' + model);
          }

          const shouldRenew = Config.Settings.RenewAlways || !Conversation.uuid
          const retryRegen = Config.Settings.RetryRegenerate && Conversation.uuid;
          let type = '';
          if (retryRegen) {
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
          }
          else if (shouldRenew) {
            if (Conversation.uuid) {  // 只有在没有会话ID时才创建新会话
              type = 'c';
            } else {
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

          if (!retryRegen) {
            fetchAPI = await (async (signal, model, prompt, type) => {
              const body = {
                attachments: [],
                files: [],
                model: isPro || forceModel ? model : undefined,
                rendering_mode: 'raw',
                prompt: prompt || '',
                timezone: AI.zone()
              };

              const headers = {
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
            })(signal, model, messages[0].content, type)
          }
          const clewdStream = new ClewdStream({
            config: {
              ...Config,
              Settings: {
                ...Config.Settings,
                Superfetch: Config.Settings.Superfetch
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

          const streamThrough = Config.Settings.Superfetch ? await Readable.toWeb(fetchAPI.body).pipeThrough(clewdStream) : await fetchAPI.body.pipeThrough(clewdStream)
          // 创建收集数据的函数
          const responseDataString = await (async (readableStream) => {
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
          })(streamThrough)



          // 收集完整数据后一次性返回
          const responseData = {
            ...JSON.parse(responseDataString),
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
      }))
      break;

    case '/v1/chat/conversation':
      ((req, res) => {
        const URL = url.parse(req.url, true);
        const conversationId = URL.query.conversationId;
        const organizationId = URL.query.organizationId;

        if (!conversationId || !organizationId) {
          return res.json({
            error: {
              message: 'Missing conversationId or organizationId',
              code: 400
            }
          }, 400);
        }

        let buffer = [];
        req.on('data', (chunk => {
          buffer.push(chunk);
        }));

        req.on('end', (async () => {
          try {
            // 获取会话内容
            const fetchAPI = await (Config.Settings.Superfetch ? Superfetch : fetch)(
              `${Config.rProxy || AI.end()}/api/organizations/${organizationId}/chat_conversations/${conversationId}`, {
              headers: {
                ...AI.hdr(),
                'Accept': '*/*',
                'Content-Type': 'application/json',
                Cookie: getCookies()
              },
              method: 'GET'
            });

            await checkResErr(fetchAPI);
            updateParams(fetchAPI);

            const conversation = await fetchAPI.json();

            // 设置响应头
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });

            // 返回会话内容
            res.end(JSON.stringify({
              conversation: conversation,
              organizationId: organizationId,
              conversationId: conversationId
            }));

          } catch (err) {
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
        }));
      })(req, res);
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
      console.log('hello world', req.url)
      res.json({
        message: 'hello world',
        code: 200
      })
  }
}));

(async function () {
  await (async () => {
    if (exists(ConfigPath)) {
      const userConfig = require(ConfigPath), validConfigs = Object.keys(Config), parsedConfigs = Object.keys(userConfig), parsedSettings = Object.keys(userConfig.Settings), invalidConfigs = parsedConfigs.filter((config => !validConfigs.includes(config))), validSettings = Object.keys(Config.Settings);
      UnknownSettings = parsedSettings.filter((setting => !validSettings.includes(setting)));
      invalidConfigs.forEach((config => {
        console.warn(`unknown config in config.js: [33m${config}[0m`);
      }));
      UnknownSettings.forEach((setting => {
        console.warn(`unknown setting in config.js: [33mSettings.${setting}[0m`);
      }));
      const missingConfigs = validConfigs.filter((config => !parsedConfigs.includes(config))), missingSettings = validSettings.filter((config => !parsedSettings.includes(config)));
      missingConfigs.forEach((config => {
        console.warn(`adding missing config in config.js: [33m${config}[0m`);
        userConfig[config] = Config[config];
      }));
      missingSettings.forEach((setting => {
        console.warn(`adding missing setting in config.js: [33mSettings.${setting}[0m`);
        userConfig.Settings[setting] = Config.Settings[setting];
      }));
      ChangedSettings = parsedSettings.filter((setting => Config.Settings[setting] !== userConfig.Settings[setting]));
      (missingConfigs.length > 0 || missingSettings.length > 0) && await writeSettings(userConfig);
      userConfig.Settings.LogMessages && (Logger = createWriteStream(LogPath));
      Config = {
        ...Config,
        ...userConfig
      };
    } else {
      Config.Cookie = 'SET YOUR COOKIE HERE';
      writeSettings(Config, true);
    }
  })();
  /***************************** */
  for (let key in Config) {
    if (key === 'Settings') {
      for (let setting in Config.Settings) {
        Config.Settings[setting] = process.env[setting] ? convertToType(process.env[setting]) : Config.Settings[setting];
      }
    } else {
      Config[key] = process.env[key] ? convertToType(process.env[key]) : Config[key];
    }
  }
  Config.rProxy = Config.rProxy.replace(/\/$/, '');
  Config.CookieArray = [...new Set([Config.CookieArray].join(',').match(/(claude[-_][a-z0-9-_]*?@)?(sessionKey=)?sk-ant-sid01-[\w-]{86}-[\w-]{6}AA/g))];
  Config.unknownModels = Config.unknownModels.reduce((prev, cur) => !cur || prev.includes(cur) || AI.mdl().includes(cur) ? prev : [...prev, cur], []);
  writeSettings(Config);
  currentIndex = Config.CookieIndex > 0 ? Config.CookieIndex - 1 : Config.Cookiecounter >= 0 ? Math.floor(Math.random() * Config.CookieArray.length) : 0;
  /***************************** */
  Proxy.listen(Config.Port, Config.Ip, onListen);
  Proxy.on('error', (err => {
    console.error('Proxy error\n%o', err);
  }));
})();

const cleanup = async () => {
  console.log('cleaning...');
  try {
    // await deleteChat(Conversation.uuid);
    SuperfetchFoldersRm();
    Logger?.close();
  } catch (err) { }
  process.exit();
};

process.on('SIGHUP', cleanup);

process.on('SIGTERM', cleanup);

process.on('SIGINT', cleanup);

process.on('exit', (async () => {
  console.log('exiting...');
}));