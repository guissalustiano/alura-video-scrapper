const puppeteer = require('puppeteer');
const fs = require('fs');
const spawn = require('child_process').spawn;

const username = '';
const password = '';
const urls_careers = [];
const urls_course = [];
const urls_lesson = [];
const videos = [];

const GLOBAL_CONFIG = {ignoreHTTPSErrors:true, headless: true};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms)); // não necessario, mas mais humano
}

async function main() {
  const browser = await puppeteer.launch(GLOBAL_CONFIG);
  const page = await browser.newPage();

  await doLogin(page, username, password);

  for(let url_careers of urls_careers) {
    let new_urls_course = await getCourses(page, url_careers);
    new_urls_course.forEach(course => urls_course.push(course));
    await sleep(60000);
  };
  console.log("url_course:", urls_course);

  for(let url_course of urls_course) {
    let new_urls_lesson = await getLessons(page, url_course);
    new_urls_lesson.forEach(lesson => urls_lesson.push(lesson));
    await sleep(60000);
  };
  console.log("url_lesson:", urls_lesson);
  
  for(let url_lesson of urls_lesson) {
    const video = await getVideo(page, url_lesson);
    downloadVideo(video.url, video.path);
    await sleep(60000);
  };
  browser.close();
}

const USERNAME_SELECTOR = '#login-email';
const PASSWORD_SELECTOR = '#password';
const BUTTON_SELECTOR ='#form-default button.btn-login';
const DASHBOARD_URL = 'https://cursos.alura.com.br/dashboard'
const LOGIN_URL = `https://cursos.alura.com.br/loginForm?urlAfterLogin=${DASHBOARD_URL}`;

async function doLogin(page, username, password) {
  await page.goto(LOGIN_URL, {waitUntil: 'domcontentloaded'});

  await page.click(USERNAME_SELECTOR);
  await page.keyboard.type(username);

  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(password);

  await sleep(5000);

  console.log("[STATUS]: Tentando fazer login...");
  await page.click(BUTTON_SELECTOR);
  await sleep(5000);
  /*await page.waitForNavigation({
    waitUntil: 'domcontentloaded',
  });*/

  if (page.url() != DASHBOARD_URL)
    throw "Erro ao fazer o login";
}

async function getCourses(page, url_careers) {
  await sleep(5000);
  console.log("[STATUS]: Acessando a página da carreira: " + url_careers);
  await page.goto(url_careers, {waitUntil: 'domcontentloaded'});

  console.log("[STATUS]: Capturando lista de cursos...");
  const hrefs = await page.evaluate(
    () => Array.from(document.body.querySelectorAll('a.learning-content__link[href]'), ({ href }) => href)
  );
  const lessonHrefs = hrefs.filter(href => href.includes('/course/'));

  console.log('[STATUS]: Total de Cursors encontrados: ' + lessonHrefs.length);

  await sleep(5000);
  return lessonHrefs;
}

async function getLessons(page, url_course) {
  console.log("[STATUS]: Acessando a página do curso: " + url_course);
  await page.goto(url_course, {waitUntil: 'domcontentloaded'});
  
  console.log("[STATUS]: Iniciando curso...");
  await page.click('a.course-header-button.startContinue-button');
  await sleep(5000);
  if (!page.url().includes("/task/"))
    throw "Erro ao fazer ao acessar a pagina de videos";

  const tasks = await page.evaluate(
    () => Array.from(document.body.querySelectorAll('select.task-menu-sections-select option'), ({value})=>value)
  );

  console.log("[STATUS]: capturando videos");
  const videos = [];

  const current_url = page.url();
  const urls_taks = tasks.map(task => current_url.replace(/task\/\d+$/gm, `section/${task}/tasks`));
  // current: https://cursos.alura.com.br/course/kafka-introducao-a-streams-em-microservicos/task/67762
  //      to: https://cursos.alura.com.br/course/kafka-introducao-a-streams-em-microservicos/section/${this.value}/tasks;

  for(let url_taks of urls_taks){
    console.log("[STATUS]: Acessando topico: " + url_taks);
    await page.goto(url_taks, {waitUntil: 'domcontentloaded'});
    await sleep(10000);
    const current_videos = await page.evaluate(
      () => Array.from(document.body.querySelectorAll('a.task-menu-nav-item-link.task-menu-nav-item-link-VIDEO'), ({href})=>href)
    );
    current_videos.forEach(video => videos.push(video));
  }

  return videos;
}

async function getVideo(page, url_lesson) {
  console.log("[STATUS]: Acessando aula: " + url_lesson);
  await page.goto(url_lesson + '/video', {waitUntil: 'domcontentloaded'});
  await sleep(3000);
  const streamLinks = await page.evaluate(() =>  {
      return JSON.parse(document.querySelector("body").innerText); 
  });
  const url = streamLinks[0].link;
  const path = generatePath(url_lesson);

  return {path, url};
}

function generatePath(url) {
  let path = url.replace(/^.*\.com.br\/course/, '.');
  path = path.replace('/task', '');

  dir = path.replace(/\/\d+$/gm, '');

  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  return path + ".mp4";
}

async function downloadVideo(url, path) {
  console.log("[STATUS]: baixando: " + url);
  const cmd = '/usr/bin/ffmpeg';
  const args = [
    '-y',
    '-i', url,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    path
  ]
  const proc = spawn(cmd, args);

  proc.stdout.on('data', function(data) {
    console.log(data);
  });
  proc.stderr.setEncoding("utf8")
  proc.stderr.on('data', function(data) {
    console.log(data);
  });

  return new Promise((resolve, reject) => {
    proc.on('close', function() {
      resolve();
    });

    proc.on('error', () => {
      reject()
    })
  })
}

main();
