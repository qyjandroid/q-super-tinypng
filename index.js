#!/usr/bin/env node

/** 
 * 
 * 参考： https://segmentfault.com/a/1190000015467084
 * 优化：通过 X-Forwarded-For 添加了动态随机伪IP，绕过a tinypng 的上传数量限制
 * 
 *  */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');


function initConfig(){
    const argv=process.argv;
    let curConfig={};
    for (let i=0;i<argv.length;i++){
        const item=argv[i];
        const array=`${item}`.split("=");
        if(array.length===2){
            curConfig[array[0]]=array[1];
        }
    }
    return curConfig;
}

const config=initConfig();
console.warn("配置文件==",config);
const cwd = process.cwd();

const root = path.join(cwd,config.path || "");
console.warn("图片目录==",root);
//输出路径
const outPath= path.join(cwd,config.outPath || config.path);
console.warn("图片输出目录==",outPath);
exts = ['.jpg', '.png'],
  max = 5200000; // 5MB == 5242848.754299136


const options = {
  method: 'POST',
  hostname: 'tinypng.com',
  path: '/web/shrink',
  headers: {
    rejectUnauthorized: false,
    'Postman-Token': Date.now(),
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
  }
};

fileList(root);

function mkDirsSync(dirname) {
    if (fs.existsSync(dirname)) {
      return true;
    } else {
      if (mkDirsSync(path.dirname(dirname))) {
        fs.mkdirSync(dirname);
        return true;
      }
    }
  }


// 生成随机IP， 赋值给 X-Forwarded-For
function getRandomIP() {
  return Array.from(Array(4)).map(() => parseInt(Math.random() * 255)).join('.')
}

// 获取文件列表
function fileList(folder) {
  fs.readdir(folder, (err, files) => {
    if (err) {
        console.error("图片path配置错误:",err);
        return;
    }
    files.forEach(file => {
      const filePath = path.join(folder, file);
      fileFilter(filePath);
    });
  });
}

// 过滤文件格式，返回所有jpg,png图片
function fileFilter(file) {
  fs.stat(file, (err, stats) => {
    if (err) {
        return console.error(file+":文件读取错误:",err);
    };
    if (
      // 必须是文件，小于5MB，后缀 jpg||png path.extname获取文件后缀
      stats.size <= max &&
      stats.isFile() &&
      exts.includes(path.extname(file))
    ) {

      // 通过 X-Forwarded-For 头部伪造客户端IP
      options.headers['X-Forwarded-For'] = getRandomIP();

      fileUpload(file); 
      console.log('可以压缩：' + file);
      return;
    }
    if (stats.isDirectory()) {
        fileList(file + '/')
        return;
    };
    console.log(`文件格式不正确：${file}`);
  });
}

// 异步API,压缩图片
// {"error":"Bad request","message":"Request is invalid"}
// {"input": { "size": 887, "type": "image/png" },"output": { "size": 785, "type": "image/png", "width": 81, "height": 81, "ratio": 0.885, "url": "https://tinypng.com/web/output/7aztz90nq5p9545zch8gjzqg5ubdatd6" }}
function fileUpload(img) {
  const req = https.request(options, function (res) {
    res.on('data', buf => {
        const bufStr=buf.toString();
        try{
            let obj = JSON.parse(bufStr);
            if (obj.error) {
              console.error(`[${img}] \n 文件上传错误，err:${obj.message}`);
            } else {
              fileUpdate(img, obj);
            }
        }catch(e){
            console.error(`[${img}] \n 文件上传错误，err:${e}`);
        }
      
    });
  });
 

  req.write(fs.readFileSync(img), 'binary');
  req.on('error', e => {
    console.error(`[${img}] \n 文件上传错误，err:${e}`);
  });
  req.end();
}
// 该方法被循环调用,请求图片数据
function fileUpdate(imgPath, obj) {
  // const outputDir = path.join(cwd, 'output');
  const  imgOutFile = path.join(outPath, imgPath.replace(root, ''));
  const imgOutDirName=path.dirname(imgOutFile);
  if (!fs.existsSync(imgOutDirName)) {
        console.log("创建目录=",imgOutDirName);
        mkDirsSync(imgOutDirName);
  }

  let options = new URL(obj.output.url);
  let req = https.request(options, res => {
    let body = '';
    res.setEncoding('binary');
    res.on('data', function (data) {
      body += data;
    });

    res.on('end', function () {
      fs.writeFile(imgOutFile, body, 'binary', err => {
        if (err) {
            console.error(`[${imgPath}] \n 压缩失败，err:${err}`);
            return;
        }
        console.log(
          `[${imgPath}] \n 压缩成功，原始大小-${obj.input.size}，压缩大小-${obj.output.size
          }，优化比例-${obj.output.ratio}`
        );
      });
    });
  });
  req.on('error', e => {
    console.error(e);
  });
  req.end();
}
