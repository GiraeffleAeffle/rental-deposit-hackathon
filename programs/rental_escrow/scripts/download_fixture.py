#!/usr/bin/env python3
"""Read-only public Kamino SBF/account snapshot for a local SVM fixture; no keys or transactions."""
import argparse,base64,hashlib,json,pathlib,time,urllib.request
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',required=True,type=pathlib.Path)
args=parser.parse_args()
out=args.out;out.mkdir(parents=True,exist_ok=True)
alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58encode(data):
 x=int.from_bytes(data,'big');s=''
 while x: x,r=divmod(x,58);s=alphabet[r]+s
 return '1'*(len(data)-len(data.lstrip(b'\0')))+s
def rpc(method,params):
 req=urllib.request.Request('https://api.mainnet-beta.solana.com',data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as r:v=json.load(r)
 if 'error'in v: raise RuntimeError(v['error'])
 return v['result']
program='KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD'
p=rpc('getAccountInfo',[program,{'encoding':'base64','commitment':'finalized'}])['value']
assert p['owner']=='BPFLoaderUpgradeab1e11111111111111111111111' and p['executable']
data=base64.b64decode(p['data'][0]);assert int.from_bytes(data[:4],'little')==2
programdata=b58encode(data[4:36])
p=rpc('getAccountInfo',[programdata,{'encoding':'base64','commitment':'finalized'}])['value']
assert p['owner']=='BPFLoaderUpgradeab1e11111111111111111111111' and not p['executable']
data=base64.b64decode(p['data'][0]);assert int.from_bytes(data[:4],'little')==3
binary=data[45:];assert binary[:4]==b'\x7fELF';(out/'klend.so').write_bytes(binary)
keys=['D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59','7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF','SysvarC1ock11111111111111111111111111111111']
result=rpc('getMultipleAccounts',[keys,{'encoding':'base64','commitment':'finalized'}])
accounts=dict(zip(keys,result['value']));reserve=base64.b64decode(result['value'][0]['data'][0])
oracles=list(dict.fromkeys(b58encode(reserve[n:n+32])for n in [5112,5160,5192,5224]));oracles=[k for k in oracles if k not in ['11111111111111111111111111111111','nu11111111111111111111111111111111111111111',program]]
if oracles:
 time.sleep(1)
 more=rpc('getMultipleAccounts',[oracles,{'encoding':'base64','commitment':'finalized'}]);accounts.update(zip(oracles,more['value']))
(out/'accounts.json').write_text(json.dumps({'slot':result['context']['slot'],'accounts':accounts}))
(out/'provenance.json').write_text(json.dumps({'program':program,'programData':programdata,'sha256':hashlib.sha256(binary).hexdigest(),'snapshotSlot':result['context']['slot'],'oracleAccounts':oracles,'purpose':'local modified test-asset fixture only; not a mainnet transaction'},indent=2))
print((out/'provenance.json').read_text())
