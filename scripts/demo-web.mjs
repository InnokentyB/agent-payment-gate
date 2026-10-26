import {createDemoBackend} from '../src/demo-backend.mjs';
import {createDemoServer} from '../src/demo-server.mjs';
const port=Number(process.env.PORT||3157);
if(process.env.ALLOW_TESTNET!=='yes')throw Error('Testnet opt-in is required');
const backend=await createDemoBackend();
const server=createDemoServer({backend,port});server.listen(port,'0.0.0.0',()=>console.log(`Demo listening on port ${port}; testnet only; keys stay on server`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
