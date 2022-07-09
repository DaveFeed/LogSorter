//Настройка пакетов
//#region Packages 
//Dependencies
const config = require('./config');
const fs = require('fs');
var AdmZip = require("adm-zip");
const archiver = require('archiver');
const axios = require('axios');
const util = require('util');
const stream = require('stream');
const fsExtra = require('fs-extra');
const texts = require('./texts');
//Telegraf
const telegraf = require('telegraf');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const session = require('telegraf/session');
const stage = new Stage();
const bot = new telegraf(config.token);
const db = require('quick.db');
const anonfile = require('anonfile-lib');
const unrar = require('@continuata/unrar');
const path = require('path');

if (db.has(`Users`)) {
    Object.values(db.get(`Users`)).forEach(user => {
        db.set(`Users.id${user.id}.isWaiting`, false);
    });
}

bot.log = (text) => {
    if (config.logger) console.log(text);
}
if (!fs.existsSync('./temp'))
    fs.mkdirSync('./temp');
fsExtra.emptyDirSync('./temp');
fs.mkdirSync('./temp/sorting');
fs.mkdirSync('./temp/unzip');
fs.mkdirSync('./temp/zip');
if (!fs.existsSync('./files'))
    fs.mkdirSync('./files');
//#endregion

//#region Stages

//#region Sort
const sort = new Scene('sort');
sort.enter((ctx) => {
    ctx.reply(texts.Sort_Choose, {
        reply_markup: {
            keyboard: [[texts.Return_Button]],
            resize_keyboard: true
        }
    });
});
sort.on("document", ctx => {
    let document = ctx.message.document;
    if (document.mime_type.includes('zip')) {
        let document = ctx.message.document;
        let size = document.file_size;//bites
        db.set(`Users.id${ctx.message.from.id}.temp`, {
            name: document.file_name,
            fileid: document.file_id,
            type: 'zip'
        });
        ctx.scene.leave();
        ctx.scene.enter("choosing");
    } /*else if (document.mime_type.includes('rar')) {
        let document = ctx.message.document;
        let size = document.file_size;//bites
        db.set(`Users.id${ctx.message.from.id}.temp`, {
            name: document.file_name,
            fileid: document.file_id,
            type: 'rar'
        });
        ctx.scene.leave();
        ctx.scene.enter("choosing");
    }*/
    //TODO:: Rar and tar.gz file support and stuff lmao kill me pls
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1);
})
stage.register(sort);
//#endregion

//#region Password
const password = new Scene('password');
password.enter((ctx) => {
    ctx.reply(texts.Password_Choose, {
        reply_markup: {
            keyboard: [[texts.Return_Button]],
            resize_keyboard: true
        }
    });
});
password.on("document", ctx => {
    let document = ctx.message.document;
    if (document.mime_type.includes('zip')) {
        let document = ctx.message.document;
        let size = document.file_size;//bites
        db.set(`Users.id${ctx.message.from.id}.temp`, {
            name: document.file_name,
            fileid: document.file_id,
            type: 'zip'
        });
        ctx.scene.leave();
        ctx.scene.enter("geturl");
    } /*else if (document.mime_type.includes('rar')) {
        let document = ctx.message.document;
        let size = document.file_size;//bites
        db.set(`Users.id${ctx.message.from.id}.temp`, {
            name: document.file_name,
            fileid: document.file_id,
            type: 'rar'
        });
        ctx.scene.leave();
        ctx.scene.enter("geturl");
    }*/
    //TODO:: Rar and tar.gz file support and stuff lmao kill me pls
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1);
})
stage.register(password);
//#endregion

//#region Url
const geturl = new Scene('geturl')
geturl.enter((ctx) => {
    ctx.reply(texts.URL_Text, {
        reply_markup: {
            keyboard: [[texts.Return_Button]],
            resize_keyboard: true
        }
    })
})
geturl.on("text", ctx => {
    if (ctx.message.text == texts.Return_Button)
        return ctx.scene.leave() | StartHandler(ctx);
    let url = ctx.message.text.trim().toLowerCase();
    db.set(`Users.id${ctx.message.from.id}.temp.url`, url);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1)
    return ctx.scene.enter('workpass')
})
stage.register(geturl)
//#endregion

//#region Work And Send
const workpass = new Scene('workpass')
workpass.enter(async (ctx) => {
    //Let user know that the shit started
    ctx.reply(texts.Started_Text, {
        reply_markup: {
            remove_keyboard: true
        }
    });
    db.set(`Users.id${ctx.message.from.id}.isWaiting`, true);

    //Create temp directories for user stuff
    if (!fs.existsSync(`./temp/zip/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/zip/${ctx.message.from.id}`);
    if (!fs.existsSync(`./temp/unzip/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/unzip/${ctx.message.from.id}`);
    if (!fs.existsSync(`./temp/sorting/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/sorting/${ctx.message.from.id}`);

    let temp = db.get(`Users.id${ctx.message.from.id}.temp`);
    /*
     * name: string,
     * fileid: string,
     * url: lowercase_string
     * type: 'zip' | 'rar'
     */

    //Download file and unzip it
    let url = await ctx.telegram.getFileLink(temp.fileid)
    let response = await axios({ url, responseType: 'stream' });
    const pipeline = util.promisify(stream.pipeline)
    async function run() {
        await pipeline(
            response.data,
            fs.createWriteStream(`./temp/zip/${ctx.message.from.id}/${temp.name}`)
        );
    }
    await run().catch(console.error)

    if (temp.type == 'zip')
        unzip(ctx, temp.name)
    else await unrarPromise(ctx, temp.name)
    let dirs = fs.readdirSync(`./temp/unzip/${ctx.message.from.id}/${temp.name}`)

    let newdata = "===============\n";
    for (let i = 0; i < dirs.length; i++) {
        try {
            let data = fs.readFileSync(`./temp/unzip/${ctx.message.from.id}/${temp.name}/${dirs[i]}/Passwords.txt`, { encoding: "utf8", flag: 'r' });
            let dataset = data.replace(/(\r)/gm, "").split('\n');
            let region = data.match((/(?<=URL: )(.*)(?=)/g));
            region.forEach(url => {
                if (url.toLowerCase().includes(temp.url)) {
                    let id = dataset.indexOf(`URL: ${url}`);
                    newdata += dataset[id++] + "\n";
                    newdata += dataset[id++] + "\n";
                    newdata += dataset[id++] + "\n";
                    newdata += dataset[id++] + "\n";
                    newdata += "===============\n"
                }
            });
        }
        catch (e) { }
    }
    let filename = `./files/${getRandomString(config.namelength)}.txt`;
    fs.writeFileSync(filename, newdata);

    await ctx.telegram.sendDocument(ctx.message.chat.id, {
        source: `${filename}`
    })

    fsExtra.emptyDirSync(`./temp/sorting/${ctx.message.from.id}`);
    fsExtra.emptyDirSync(`./temp/unzip/${ctx.message.from.id}`);
    fs.unlinkSync(`${filename}`);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1);
    db.add(`Users.id${ctx.message.from.id}.filesCreated`, 1);
    db.set(`Users.id${ctx.message.from.id}.temp`, {});
    db.set(`Users.id${ctx.message.from.id}.isWaiting`, false);
    ctx.scene.leave();
    StartHandler(ctx);
});
stage.register(workpass);
//#endregion

//#region Choosing
const choosing = new Scene('choosing')
choosing.enter((ctx) => {
    ctx.reply(texts.Choosing_Text, {
        reply_markup: {
            keyboard: [[texts.Return_Button]],
            resize_keyboard: true
        }
    })
})
choosing.on("text", ctx => {
    if (ctx.message.text == texts.Return_Button)
        return ctx.scene.leave() | StartHandler(ctx);
    let args = ctx.message.text.trim().toUpperCase().split(' ');
    db.set(`Users.id${ctx.message.from.id}.temp.args`, args);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1)
    return ctx.scene.enter('foldermethod')
})
stage.register(choosing)
//#endregion

//#region FolderMethod
const foldermethod = new Scene('foldermethod')
foldermethod.enter((ctx) => {
    ctx.reply(texts.FolderMethod_Text, {
        reply_markup: {
            keyboard: [[texts.Folder_Button1], [texts.Folder_Button2]],
            resize_keyboard: true
        }
    })
})
foldermethod.hears(texts.Folder_Button1, ctx => {
    db.set(`Users.id${ctx.message.from.id}.temp.method`, 1);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1)
    return ctx.scene.enter('work')
})
foldermethod.hears(texts.Folder_Button2, ctx => {
    db.set(`Users.id${ctx.message.from.id}.temp.method`, 2);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1)
    return ctx.scene.enter('work')
})
//Method 1: all in one folder
//Method 2: all in seperate country folders
stage.register(foldermethod)
//#endregion

//#region Work And Send
const work = new Scene('work')
work.enter(async (ctx) => {
    //Let user know that the shit started
    ctx.reply(texts.Started_Text, {
        reply_markup: {
            remove_keyboard: true
        }
    });
    db.set(`Users.id${ctx.message.from.id}.isWaiting`, true);

    //Create temp directories for user stuff
    if (!fs.existsSync(`./temp/zip/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/zip/${ctx.message.from.id}`);
    if (!fs.existsSync(`./temp/unzip/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/unzip/${ctx.message.from.id}`);
    if (!fs.existsSync(`./temp/sorting/${ctx.message.from.id}`))
        fs.mkdirSync(`./temp/sorting/${ctx.message.from.id}`);

    let temp = db.get(`Users.id${ctx.message.from.id}.temp`);
    /*
     * name: string,
     * fileid: string,
     * args: [...]
     * method: 1 | 2 
     */

    //Download file and unzip it
    let url = await ctx.telegram.getFileLink(temp.fileid)
    let response = await axios({ url, responseType: 'stream' });
    const pipeline = util.promisify(stream.pipeline)
    async function run() {
        await pipeline(
            response.data,
            fs.createWriteStream(`./temp/zip/${ctx.message.from.id}/${temp.name}`)
        );
    }
    await run().catch(console.error)

    if (temp.type == 'zip')
        unzip(ctx, temp.name)
    else await unrarPromise(ctx, temp.name)
    let dirs = fs.readdirSync(`./temp/unzip/${ctx.message.from.id}/${temp.name}`)

    if (temp.method == 1) {
        //METHOD 1 (ALL IN ONE)
        for (let i = 0; i < dirs.length; i++) {
            let region = ["null"];
            try {
                let data = fs.readFileSync(`./temp/unzip/${ctx.message.from.id}/${temp.name}/${dirs[i]}/UserInformation.txt`, { encoding: "utf8", flag: 'r' });
                region = data.match((/(?<=Country: )(.*)(?=)/g));
                if (region[0] == "null" || region[0] == "")
                    region = ["unknown"]
                if (temp.args.includes(region[0].trim().toUpperCase()))
                    await fsExtra.copy(`./temp/unzip/${ctx.message.from.id}/${temp.name}/${dirs[i]}`, `./temp/sorting/${ctx.message.from.id}/Logs_By_${config.logname}/${dirs[i]}`)

            }
            catch (e) {
                ctx.reply(texts.File_error)
                fsExtra.emptyDirSync(`./temp/sorting/${ctx.message.from.id}`);
                fsExtra.emptyDirSync(`./temp/unzip/${ctx.message.from.id}`);
                db.set(`Users.id${ctx.message.from.id}.temp`, {});
                db.set(`Users.id${ctx.message.from.id}.isWaiting`, false);
                return;
            }
        };
    }
    else if (temp.method == 2) {
        //METHOD 2 (ALL IN SEPERATE COUNTRY)
        for (let i = 0; i < dirs.length; i++) {
            let region = ["null"];
            try {
                let data = fs.readFileSync(`./temp/unzip/${ctx.message.from.id}/${temp.name}/${dirs[i]}/UserInformation.txt`, { encoding: "utf8", flag: 'r' });
                region = data.match((/(?<=Country: )(.*)(?=)/g));
                if (region[0] == "null" || region[0] == "")
                    region = ["unknown"]
                if (temp.args.includes(region[0].trim().toUpperCase())) {
                    await fsExtra.copy(`./temp/unzip/${ctx.message.from.id}/${temp.name}/${dirs[i]}`, `./temp/sorting/${ctx.message.from.id}/Logs_By_${config.logname}/${region[0].trim().toUpperCase()}/${dirs[i]}`)
                }
            }
            catch (e) {
                ctx.reply(texts.File_error)
                fsExtra.emptyDirSync(`./temp/sorting/${ctx.message.from.id}`);
                fsExtra.emptyDirSync(`./temp/unzip/${ctx.message.from.id}`);
                db.set(`Users.id${ctx.message.from.id}.temp`, {});
                db.set(`Users.id${ctx.message.from.id}.isWaiting`, false);
                return;
            }
        }
    }
    let filename = `${getRandomString(config.namelength)}.zip`;
    await zipDirectory(`./temp/sorting/${ctx.message.from.id}/`, `./files/${filename}`);

    //TODO::Check if file is bigger than 5gb
    let size = fs.statSync(`./files/${filename}`).size;
    let sendmethod = size < 50 * 1024 * 1024 /*50mb*/ ? 'Telegram' : 'Anonfiles';
    ctx.reply(texts.Sending_Text.replace('[SIZE]', humanFileSize(size, true)).replace('[WAY]', sendmethod));
    if (sendmethod == 'Telegram')
        await ctx.telegram.sendDocument(ctx.message.chat.id, {
            source: `./files/${filename}`
        })
    else {
        let info = await anonfile.upload(`./files/${filename}`)
        if (!info.status) ctx.reply(texts.Error)
        else ctx.reply(`Ссылка: ${info.data.file.url.short}`)
    }
    //TODO::Find a better FS with support more than 5gb file size

    fsExtra.emptyDirSync(`./temp/sorting/${ctx.message.from.id}`);
    fsExtra.emptyDirSync(`./temp/unzip/${ctx.message.from.id}`);
    fs.unlinkSync(`./files/${filename}`);
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1);
    db.add(`Users.id${ctx.message.from.id}.filesCreated`, 1);
    db.set(`Users.id${ctx.message.from.id}.temp`, {});
    db.set(`Users.id${ctx.message.from.id}.isWaiting`, false);
    ctx.scene.leave();
    StartHandler(ctx);
});
stage.register(work);
//#endregion

//#region Admin
const admin = new Scene('admin')
admin.enter((ctx) => ctx.reply("Выберите действие", {
    reply_markup: {
        keyboard: [
            ["Общая статистика"],
            ["Статистика пользователя"],
            ["Отправить рекламу"],
            ["Запустить кусок кода"],
            [texts.Return_Button]
        ],
        resize_keyboard: true
    }
}))
admin.hears("Общая статистика", (ctx) => {
    let messages = 0, users = 0, files = 0, lastjoin = 0;
    Object.values(db.get("Users")).forEach(info => {
        messages += info.messagesSent;
        users++;
        files += info.filesCreated;
        if (lastjoin < info.joined) lastjoin = info.joined;
    })
    ctx.reply(`Количество пользователей: ${users}\nКоличество сообшений получено: ${messages}\nКоличество созданных файлов:${files}\nПоследний пользователь присоеденился в: ${timeConverter(lastjoin)}`)
})
admin.hears("Статистика пользователя", (ctx) => ctx.scene.enter('userstats'))
admin.hears("Отправить рекламу", (ctx) => ctx.scene.enter('sendAD'))
admin.hears("Запустить кусок кода", (ctx) => ctx.scene.enter('evalexec'))
stage.register(admin)
//#endregion

//#region UserStats
const userstats = new Scene('userstats')
userstats.enter((ctx) => {
    ctx.reply("Напишите ID пользователя. Например: \"1089951619\"", {
        reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button],
            ],
            resize_keyboard: true
        }
    })
})
userstats.on("text", (ctx) => {
    if (ctx.message.text == "Обратно")
        return ctx.scene.enter('admin')
    let info = db.get(`Users.id${ctx.message.text.trim().toLowerCase()}`)
    if (!info) ctx.reply(`Нету данных по данному ID!`)
    else ctx.reply(
        `Имя пользователя: ${info.username}\
       \nID: ${info.id}\
       \nПрисоеденился: ${timeConverter(info.joined)}\
       \nСоздано файлов: ${info.filesCreated}\
       \nОтправленно Сообщений: ${info.messagesSent}\
       \nДоставлено Реклам: ${info.adsSeen}`)
})
stage.register(userstats)
//#endregion

//#region SendAD
const sendAD = new Scene('sendAD')
sendAD.enter((ctx) => {
    ctx.reply("ДОДЕЛАТЬ", {
        reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button],
            ],
            resize_keyboard: true
        }
    })
})
sendAD.on("text", (ctx) => {
    if (ctx.message.text == "Обратно")
        return ctx.scene.enter('admin')
    ctx.scene.enter('admin')
})
stage.register(sendAD)
//#endregion

//#region evalexec
const evalexec = new Scene('evalexec')
evalexec.enter((ctx) => {
    ctx.reply("Выберите вариант", {
        reply_markup: {
            keyboard: [
                ["Eval", "Exec"],
                ["Обратно"],
                [texts.Return_Button]
            ],
            resize_keyboard: true
        }
    })
})
evalexec.hears("Eval", ctx => ctx.scene.enter('eval'))
evalexec.hears("Exec", ctx => ctx.scene.enter('exec'))
stage.register(evalexec)

//#region eval
const codeeval = new Scene('eval')
codeeval.enter((ctx) => {
    ctx.reply("Напишите код для запуска", {
        reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button]
            ],
            resize_keyboard: true
        }
    })
})
codeeval.on("text", (ctx) => {
    if (ctx.message.text == "Обратно")
        return ctx.scene.enter('admin');
    if (ctx.message.text == texts.Return_Button)
        return StartHandler(ctx);

    let code = ctx.message.text;
    var evaled = eval(code);
    if (typeof evaled !== 'string') {
        evaled = util.inspect(evaled);
    }
    ctx.reply(`${evaled}`, {
        reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button]
            ],
            resize_keyboard: true
        }
    })
})
stage.register(codeeval)
//#endregion

//#region exec
const codeexec = new Scene('exec')
codeexec.enter((ctx) => {
    ctx.reply("Напишите код для запуска", {
        reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button]
            ],
            resize_keyboard: true
        }
    })
})
codeexec.on("text", async (ctx) => {
    if (ctx.message.text == "Обратно")
        return ctx.scene.enter('admin');
    if (ctx.message.text == texts.Return_Button)
        return StartHandler(ctx);

    const exec = util.promisify(require('child_process').exec);
    try {
        const { stdout, stderr } = await exec(ctx.message.text);
        ctx.reply(`Stdout:\n${stdout}\n\nStderr:\n${stderr}`, {reply_markup: {
            keyboard: [
                ["Обратно"],
                [texts.Return_Button]
            ],
            resize_keyboard: true
        }})
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }
})
stage.register(codeexec)
//#endregion

//#endregion

//#endregion

//#region Bot Setup
bot.use(session());
bot.use(stage.middleware());
bot.catch((err, ctx) => CatchHandler(ctx, err));
bot.start(StartHandler);
bot.hears(texts.Sort_Button, (ctx) => {
    if (db.has(`Users.id${ctx.message.from.id}`) && db.get(`Users.id${ctx.message.from.id}.isWaiting`))
        return ctx.reply(texts.Waiting_Text);
    ctx.scene.enter('sort');
});
bot.hears(texts.Passwords_Button, (ctx) => {
    if (db.has(`Users.id${ctx.message.from.id}`) && db.get(`Users.id${ctx.message.from.id}.isWaiting`))
        return ctx.reply(texts.Waiting_Text);
    ctx.scene.enter('password');
});
bot.hears(texts.Return_Button, (ctx) => {
    ctx.scene.leave();
    StartHandler(ctx);
});
bot.hears(texts.Admin_Button, (ctx) => {
    if (config.owners.includes(ctx.message.from.id.toString()))
        ctx.scene.enter('admin');
});
bot.hears(texts.FAQ_Button, (ctx) => ctx.reply(texts.FAQ.replace('[NICKNAME]', config.admin)));
bot.hears(texts.Help_Button, (ctx) => ctx.reply(texts.Help.replace('[NICKNAME]', config.admin)));
//#endregion

//#region Handlers and Functions
async function StartHandler(ctx) {
    try { ctx.scene.leave() } catch (e) { }
    if (!db.has(`Users.id${ctx.message.from.id}`)) {
        db.set(`Users.id${ctx.message.from.id}`, {
            username: ctx.message.from.username,
            id: ctx.message.from.id,
            joined: new Date().getTime(),
            filesCreated: 0,
            messagesSent: 0,
            adsSeen: 0,
            temp: {}
        })
    }
    let keyboard = [
        [texts.Sort_Button, texts.Passwords_Button],
        [texts.FAQ_Button, texts.Help_Button]
    ]
    if (config.owners.includes(ctx.message.from.id.toString())) {
        keyboard.push([texts.Admin_Button])
    }
    ctx.reply(texts.Start.replace('[NICKNAME]', ctx.message.from.first_name), {
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true
        }
    })
    db.add(`Users.id${ctx.message.from.id}.messagesSent`, 1)
}

function CatchHandler(ctx, e) {
    try {
        ctx.reply(e.toString()), {
            keyboard: [
                [texts.Return_Button]
            ],
            resize_keyboard: true
        };
        bot.log(e);
    } catch (err) { }
}

function getRandomString(length) {
    var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    return result;
}

function zipDirectory(source, out) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
        archive
            .directory(source, false)
            .on('error', err => reject(err))
            .pipe(stream);

        stream.on('close', () => resolve());
        archive.finalize();
    });
}

function unzip(ctx, file) {
    let zip = new AdmZip(`./temp/zip/${ctx.message.from.id}/${file}`);
    zip.extractAllTo(`./temp/unzip/${ctx.message.from.id}/${file}`, true);
}

async function unrarPromise(ctx, file) {
    const src = path.join(__dirname, `./temp/zip/${ctx.message.from.id}/${file}`);
    const dest = path.join(__dirname, `./temp/unzip/${ctx.message.from.id}/${file}`)
    await unrar.uncompress({
        src: src,
        dest: dest,
        command: 'x',
        switches: ['-o+', '-idcd'],
    });
}

function humanFileSize(bytes, si = false, dp = 1) {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


    return bytes.toFixed(dp) + ' ' + units[u];
}

function timeConverter(UNIX_timestamp) {
    var a = new Date(UNIX_timestamp);
    var months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = "0" + a.getMinutes();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min.substr(-2);
    return time;
}
//#endregion

bot.log("Бот запустился!");
bot.startPolling();