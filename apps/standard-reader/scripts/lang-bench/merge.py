import json, collections
S='.'
rows={json.loads(l)['uri']:json.loads(l) for l in open('samples.jsonl')}
names=['glotlid','openlid2','nllb218','lid176','xlmr']
for n in names:
    for l in open(f'preds_{n}.jsonl'):
        p=json.loads(l); rows[p['uri']][n]=p['pred']; rows[p['uri']][n+'_raw']=p['raw']
json.dump(list(rows.values()),open('merged.json','w'))
core=['franc','glotlid','openlid2','nllb218','lid176']
agree=[r for r in rows.values() if len({r[c] for c in core})==1]
dis=[r for r in rows.values() if len({r[c] for c in core})>1]
print('all5 agree',len(agree),'disagree',len(dis))
print('agree langs',collections.Counter(r['franc'] for r in agree).most_common())
# pattern of disagreements: franc vs majority of the 4 HF
pat=collections.Counter()
for r in dis:
    maj=collections.Counter(r[c] for c in core[1:]).most_common(1)[0]
    pat[(r['franc'],maj[0],maj[1])]+=1
print(pat.most_common(40))
