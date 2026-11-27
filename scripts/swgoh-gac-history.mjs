import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const accounts = { Cutie: '112572244', Eri: '473975423' };
const result = { checkedAt: new Date().toISOString(), source: 'Public SWGOH.GG GAC history', accounts: {} };
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const email = process.env.SWGOH_EMAIL;
const password = process.env.SWGOH_PASSWORD;
result.authentication = 'not_configured';
if (email && password) {
  const page = await context.newPage();
  try {
    const url = 'https://swgoh.gg/accounts/login/';
    const response = await page.goto(url, {waitUntil:'domcontentloaded',timeout:30000});
    if (!response?.ok()) {
      result.authentication = 'login_http_' + response?.status();
    } else if (new URL(page.url()).origin !== 'https://swgoh.gg') {
      result.authentication = 'unexpected_login_origin';
    } else {
      const field = page.locator('input[name="login"], input[name="username"], input[type="email"]').first();
      const pass = page.locator('input[type="password"]').first();
      await field.fill(email,{timeout:10000});
      await pass.fill(password,{timeout:10000});
      await page.getByRole('button',{name:'Sign In',exact:true}).click({timeout:10000});
      await page.waitForLoadState('domcontentloaded').catch(()=>{});
      await page.waitForTimeout(1500);
      result.authentication = new URL(page.url()).pathname.includes('/accounts/login') ? 'login_not_confirmed' : 'submitted_redirected_unverified';
    }
  } catch {
    result.authentication = 'login_failed';
  } finally { await page.close(); }
}
console.log('Authentication status:',result.authentication);
try {
  for (const [name, code] of Object.entries(accounts)) {
    const url = 'https://swgoh.gg/p/' + code + '/gac-history/';
    const entry = { allyCode: code, url, status: 'unverified', pages: [], errors: [] };
    result.accounts[name] = entry;
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {waitUntil:'domcontentloaded', timeout:30000});
      if (!response?.ok()) throw Error('HTTP '+response?.status());
      await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
      const capture = async () => page.evaluate(() => ({
        title:document.title,
        text:(document.querySelector('main') || document.body).innerText.slice(0,100000),
        links:[...document.querySelectorAll('a[href]')].map(a=>({text:a.innerText.trim(),url:a.href})),
        images:[...document.querySelectorAll('main img')].map(i=>({alt:i.alt,title:i.title}))
      }));
      const home = await capture();
      if (/access denied|verify you are human|just a moment|captcha/i.test(home.title+' '+home.text.slice(0,1000))) throw Error('Access challenge');
      // Do not publish authenticated page contents or account-specific navigation to a public repository.
      entry.pages.push({url, title:home.title, text:'', links:[], images:[]});
      // Follow only actual same-origin battle-history links for this account.
      const candidates = [...new Set(home.links.map(l=>l.url).filter(h=>{
        const u=new URL(h); return u.origin==='https://swgoh.gg' && u.pathname.startsWith('/p/'+code+'/gac-history/') && u.href!==url && !u.hash;
      }))].slice(0,9);
      for(const link of candidates){
        try {
          const r=await page.goto(link,{waitUntil:'domcontentloaded',timeout:20000});
          if(!r?.ok()) throw Error('HTTP '+r?.status());
          await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
          const data=await capture();
          if(/access denied|verify you are human|just a moment|captcha/i.test(data.title+' '+data.text.slice(0,1000))) throw Error('Access challenge');
          entry.pages.push({url:link,title:data.title,text:'',links:[],images:[]});
        } catch(e){entry.errors.push({url:link,error:'page retrieval failed'});}
      }
      entry.status='pages_reachable_content_not_published';
      // Raw source text is evidence, not automatically verified battle statistics.
      entry.holdsVerified=false;
    } catch(e){entry.errors.push({url,error:String(e.message)});entry.status='unavailable';}
    finally{await page.close();}
    console.log(name,entry.status,entry.pages.length,JSON.stringify(entry.errors));
  }
} finally {await browser.close();}
await mkdir('data/swgoh-weekly',{recursive:true});
await writeFile('data/swgoh-weekly/gac-latest.json',JSON.stringify(result,null,2)+'\n');
