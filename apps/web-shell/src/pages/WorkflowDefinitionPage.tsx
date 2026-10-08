import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWorkflowDefinitions, saveWorkflowDefinition } from '../api/workflow'

const initialRules = JSON.stringify({ amount_rules: [{ min: 0, max: null, steps: [{ order: 1, role: 'APPROVER', quorum: 1 }] }] }, null, 2)

export default function WorkflowDefinitionPage() {
  const queryClient = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: ['workflow', 'definitions'], queryFn: getWorkflowDefinitions })
  const [name, setName] = useState('Default approval workflow')
  const [slaHours, setSlaHours] = useState(48)
  const [rules, setRules] = useState(initialRules)
  const [escalationEnabled, setEscalationEnabled] = useState(true)
  const [delegationEnabled, setDelegationEnabled] = useState(true)
  const mutation = useMutation({
    mutationFn: () => saveWorkflowDefinition({ name, slaHours, escalationEnabled, delegationEnabled, stepsConfig: JSON.parse(rules) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflow', 'definitions'] }),
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try { mutation.mutate() } catch { /* JSON validation is handled below */ }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Workflow definition</h1>
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <label className="block text-sm font-medium">Нэр<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" required /></label>
        <label className="block text-sm font-medium">SLA цаг<input type="number" min="1" value={slaHours} onChange={(e) => setSlaHours(Number(e.target.value))} className="mt-1 w-full border rounded px-3 py-2" required /></label>
        <label className="block text-sm font-medium">Amount rules JSON<textarea value={rules} onChange={(e) => setRules(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 font-mono text-xs" rows={10} required /></label>
        <div className="flex gap-5 text-sm"><label><input type="checkbox" checked={delegationEnabled} onChange={(e) => setDelegationEnabled(e.target.checked)} className="mr-2" />Delegation</label><label><input type="checkbox" checked={escalationEnabled} onChange={(e) => setEscalationEnabled(e.target.checked)} className="mr-2" />Escalation</label></div>
        <button type="submit" disabled={mutation.isPending} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Хадгалах</button>
        {mutation.isError && <p className="text-sm text-red-600">JSON эсвэл хадгалалтын алдаа гарлаа.</p>}
        {mutation.isSuccess && <p className="text-sm text-green-600">Workflow хадгалагдлаа.</p>}
      </form>
      {isLoading ? <p className="text-gray-500">Тодорхойлолт ачаалж байна...</p> : <div className="space-y-2">{data.map((definition) => <div key={definition.id} className="bg-white border border-gray-200 rounded-lg p-4 flex justify-between"><span className="font-medium">{definition.name}</span><span className="text-sm text-gray-500">SLA {definition.slaHours}ц</span></div>)}</div>}
    </div>
  )
}