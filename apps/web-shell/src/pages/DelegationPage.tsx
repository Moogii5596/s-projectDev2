import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDelegation, getDelegations, revokeDelegation } from '../api/workflow'

export default function DelegationPage() {
  const queryClient = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ['workflow', 'delegations'], queryFn: getDelegations })
  const [delegatorId, setDelegatorId] = useState('')
  const [delegateId, setDelegateId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const create = useMutation({ mutationFn: () => createDelegation({ delegatorId, delegateId, validUntil, reason: 'Admin delegation' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow', 'delegations'] }) })
  const revoke = useMutation({ mutationFn: revokeDelegation, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow', 'delegations'] }) })

  return <div className="space-y-6"><h1 className="text-xl font-bold text-gray-900">Delegation</h1><form onSubmit={(event) => { event.preventDefault(); create.mutate() }} className="bg-white border border-gray-200 rounded-lg p-5 grid md:grid-cols-3 gap-3"><input value={delegatorId} onChange={(e) => setDelegatorId(e.target.value)} placeholder="Delegator core user ID" className="border rounded px-3 py-2 text-sm" required /><input value={delegateId} onChange={(e) => setDelegateId(e.target.value)} placeholder="Delegate core user ID" className="border rounded px-3 py-2 text-sm" required /><input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="border rounded px-3 py-2 text-sm" required /><button className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm md:col-span-3">Delegation үүсгэх</button></form><div className="bg-white border border-gray-200 rounded-lg divide-y">{isLoading ? <p className="p-4 text-gray-500">Ачаалж байна...</p> : data.map((item) => <div key={item.id} className="p-4 flex items-center justify-between text-sm"><span>{item.delegatorId} → {item.delegateId}</span><span className="flex items-center gap-3"><span className="text-gray-500">{new Date(item.validUntil).toLocaleString('mn-MN')}</span>{item.isActive && <button onClick={() => revoke.mutate(item.id)} className="text-red-600">Цуцлах</button>}</span></div>)}</div></div>
}