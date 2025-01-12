/*
* https://rentry.org/teralomaniac_clewd
* https://github.com/teralomaniac/clewd
*/
'use strict';

const { createServer: Server, IncomingMessage, ServerResponse } = require('node:http'), { createHash: Hash, randomUUID, randomInt, randomBytes } = require('node:crypto'), { TransformStream, ReadableStream } = require('node:stream/web'), { Readable, Writable } = require('node:stream'), { Blob } = require('node:buffer'), { existsSync: exists, writeFileSync: write, createWriteStream } = require('node:fs'), { join: joinP } = require('node:path'), { ClewdSuperfetch: Superfetch, SuperfetchAvailable, SuperfetchFoldersMk, SuperfetchFoldersRm } = require('./lib/clewd-superfetch'), { AI, fileName, genericFixes, bytesToSize, setTitle, checkResErr, Replacements, Main } = require('./lib/clewd-utils'), ClewdStream = require('./lib/clewd-stream');

/******************************************************* */
let currentIndex, Firstlogin = true, changeflag = 0, changing, changetime = 0, totaltime, uuidOrgArray = [], model, cookieModel, tokens, apiKey, timestamp, regexLog, isPro, modelList = [];

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

const xmlPlot_merge = (content, mergeTag, nonsys) => {
  if (/(\n\n|^\s*)xmlPlot:\s*/.test(content)) {
    content = (nonsys ? content : content.replace(/(\n\n|^\s*)(?<!\n\n(Human|Assistant):.*?)xmlPlot:\s*/gs, '$1')).replace(/(\n\n|^\s*)xmlPlot: */g, mergeTag.system && mergeTag.human && mergeTag.all ? '\n\nHuman: ' : '$1');
  }
  mergeTag.all && mergeTag.human && (content = content.replace(/(?:\n\n|^\s*)Human:(.*?(?:\n\nAssistant:|$))/gs, function (match, p1) { return '\n\nHuman:' + p1.replace(/\n\nHuman:\s*/g, '\n\n') }));
  mergeTag.all && mergeTag.assistant && (content = content.replace(/\n\nAssistant:(.*?(?:\n\nHuman:|$))/gs, function (match, p1) { return '\n\nAssistant:' + p1.replace(/\n\nAssistant:\s*/g, '\n\n') }));
  return content;
}
const xmlPlot_regex = (content, order) => {
  let matches = content.match(new RegExp(`<regex(?: +order *= *${order})${order === 2 ? '?' : ''}> *"(/?)(.*)\\1(.*?)" *: *"(.*?)" *</regex>`, 'gm'));
  matches && matches.forEach(match => {
    try {
      const reg = /<regex(?: +order *= *\d)?> *"(\/?)(.*)\1(.*?)" *: *"(.*?)" *<\/regex>/.exec(match);
      regexLog += match + '\n';
      content = content.replace(new RegExp(reg[2], reg[3]), JSON.parse(`"${reg[4].replace(/\\?"/g, '\\"')}"`));
    } catch (err) {
      console.log(`[33mRegex error: [0m` + match + '\n' + err);
    }
  });
  return content;
}
const xmlPlot = (content, nonsys = false) => {
  regexLog = '';
  //一次正则
  content = xmlPlot_regex(content, 1);
  //一次role合并
  const mergeTag = {
    all: !content.includes('<|Merge Disable|>'),
    system: !content.includes('<|Merge System Disable|>'),
    human: !content.includes('<|Merge Human Disable|>'),
    assistant: !content.includes('<|Merge Assistant Disable|>')
  };
  content = xmlPlot_merge(content, mergeTag, nonsys);
  //自定义插入
  let splitContent = content.split(/\n\n(?=Assistant:|Human:)/g), match;
  while ((match = /<@(\d+)>(.*?)<\/@\1>/gs.exec(content)) !== null) {
    let index = splitContent.length - parseInt(match[1]) - 1;
    index >= 0 && (splitContent[index] += '\n\n' + match[2]);
    content = content.replace(match[0], '');
  }
  content = splitContent.join('\n\n').replace(/<@(\d+)>.*?<\/@\1>/gs, '');
  //二次正则
  content = xmlPlot_regex(content, 2);
  //二次role合并
  content = xmlPlot_merge(content, mergeTag, nonsys);
  //Plain Prompt
  let segcontentHuman = content.split('\n\nHuman:');
  let segcontentlastIndex = segcontentHuman.length - 1;
  if (!apiKey && segcontentlastIndex >= 2 && segcontentHuman[segcontentlastIndex].includes('<|Plain Prompt Enable|>') && !content.includes('\n\nPlainPrompt:')) {
    content = segcontentHuman.slice(0, segcontentlastIndex).join('\n\nHuman:') + '\n\nPlainPrompt:' + segcontentHuman.slice(segcontentlastIndex).join('\n\nHuman:').replace(/\n\nHuman: *PlainPrompt:/, '\n\nPlainPrompt:');
  }
  //三次正则
  content = xmlPlot_regex(content, 3);
  //消除空XML tags、两端空白符和多余的\n
  content = content.replace(/<regex( +order *= *\d)?>.*?<\/regex>/gm, '')
    .replace(/\r\n|\r/gm, '\n')
    .replace(/\s*<\|curtail\|>\s*/g, '\n')
    .replace(/\s*<\|join\|>\s*/g, '')
    .replace(/\s*<\|space\|>\s*/g, ' ')
    .replace(/\s*\n\n(H(uman)?|A(ssistant)?): +/g, '\n\n$1: ')
    .replace(/<\|(\\.*?)\|>/g, function (match, p1) {
      try {
        return JSON.parse(`"${p1.replace(/\\?"/g, '\\"')}"`);
      } catch { return match }
    });
  //确保格式正确
  if (apiKey) {
    content = content.replace(/(\n\nHuman:(?!.*?\n\nAssistant:).*?|(?<!\n\nAssistant:.*?))$/s, '$&\n\nAssistant:').replace(/\s*<\|noAssistant\|>\s*(.*?)(?:\n\nAssistant:\s*)?$/s, '\n\n$1');
    content.includes('<|reverseHA|>') && (content = content.replace(/\s*<\|reverseHA\|>\s*/g, '\n\n').replace(/Assistant|Human/g, function (match) { return match === 'Human' ? 'Assistant' : 'Human' }).replace(/\n(A|H): /g, function (match, p1) { return p1 === 'A' ? '\nH: ' : '\nA: ' }));
    return content.replace(/\s*<\|.*?\|>\s*/g, '\n\n').trim().replace(/^.+:/, '\n\n$&').replace(/(?<=\n)\n(?=\n)/g, '');
  } else {
    return content.replace(/\s*<\|.*?\|>\s*/g, '\n\n').trim().replace(/^Human: *|\n\nAssistant: *$/g, '').replace(/(?<=\n)\n(?=\n)/g, '');
  }
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
let curPrompt = {}
let prevPrompt = {}
let prevMessages = []
let prevImpersonated = false
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
  placeholder_token: '',
  placeholder_byte: '',
  PromptExperimentFirst: '',
  PromptExperimentNext: '',
  PersonalityFormat: '{{char}}\'s personality: {{personality}}',
  ScenarioFormat: 'Dialogue scenario: {{scenario}}',
  Settings: {
    RenewAlways: true,
    RetryRegenerate: false,
    PromptExperiments: true,
    SystemExperiments: true,
    PreventImperson: true,
    AllSamples: false,
    NoSamples: false,
    StripAssistant: false,
    StripHuman: false,
    PassParams: true,
    ClearFlags: true,
    PreserveChats: false,
    LogMessages: true,
    FullColon: true,
    xmlPlot: true,
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
      return changing = false, console.log(`[33mNo cookie available, enter apiKey-only mode.[0m\n`); //throw Error('Set your cookie inside config.js');
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
        `\n\n-------\n[${(new Date).toLocaleString()}]\n${Main}\n####### ${model} (${type})\n${JSON.stringify({ FusionMode: fusion, PassParams: Config.Settings.PassParams, stop_sequences, top_k, top_p }, null, 2)
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
      async function collectData (readableStream) {
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
      handleChatConversation(req, res);
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
    await deleteChat(Conversation.uuid);
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