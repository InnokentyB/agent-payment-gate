import {chromium} from 'playwright';import assert from 'node:assert/strict';
import {createDemoServer} from '../src/demo-server.mjs';import{fixtureBackend}from'./ui-fixture-backend.mjs';
const backend=fixtureBackend(),server=createDemoServer({backend,port:0});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const waitDone=async()=>{await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,{timeout:15000})};
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Check verification status'}).click();await page.locator('#identity-badge').filter({hasText:'Verified'}).waitFor();
 await page.getByRole('button',{name:'Review new permission'}).click();await page.locator('#consent-review').waitFor();await waitDone();assert(await page.getByRole('button',{name:'Sign & grant permission'}).isDisabled());await page.locator('#consent-check').check();await page.getByRole('button',{name:'Sign & grant permission'}).click();await page.locator('#permission-badge').filter({hasText:'Active'}).waitFor();await waitDone();
 await page.screenshot({path:'/evidence/desktop.png',fullPage:true});
 await page.locator('#amount').fill('1');await page.getByRole('button',{name:'Pay with agent',exact:true}).click();await page.locator('#receipts .badge').filter({hasText:'Confirmed'}).waitFor();await waitDone();assert.equal(backend.sent(),1);
 await page.getByRole('button',{name:'Pay with agent',exact:true}).click();await waitDone();assert.equal(backend.sent(),1);
 await page.getByRole('button',{name:'New invoice',exact:true}).click();await page.locator('#amount').fill('2.0000001');await page.getByRole('button',{name:'Pay with agent',exact:true}).click();await page.locator('#receipts .badge').filter({hasText:'Rejected'}).first().waitFor();await waitDone();assert.equal(backend.sent(),1);
 await page.getByRole('button',{name:'New invoice',exact:true}).click();await page.locator('#amount').fill('1');await page.locator('#recipient').selectOption('stranger');await page.getByRole('button',{name:'Pay with agent',exact:true}).click();await waitDone();assert.equal(backend.sent(),1);
 await page.getByRole('button',{name:'Revoke permission',exact:true}).click();await page.locator('#permission-badge').filter({hasText:'Revoked'}).waitFor();await waitDone();assert(await page.getByRole('button',{name:'Pay with agent',exact:true}).isDisabled());
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/evidence/mobile.png',fullPage:true});
 await page.reload();assert(await page.locator('#invoice').inputValue());await page.locator('#permission-badge').filter({hasText:'Revoked'}).waitFor();assert(await page.getByRole('button',{name:'Pay with agent',exact:true}).isDisabled());
 assert.deepEqual(errors,[]);console.log('PASS: synthetic browser journey identity → reviewed consent → payment → invoice reuse → cap/recipient rejection → revoke; desktop/mobile, no overflow, reload, no JS errors. Chromium sandbox enabled.');
}finally{await browser.close();await new Promise(r=>server.close(r))}
