import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { PRODUCT_NAME } from '@/lib/brand'

export interface Branding {
  /** Client company name, or the product name before anyone signs in. */
  name: string
  logoUrl?: string
  primaryColor?: string
  tagline: string
  address: string
  phone: string
  email: string
  /** Main branch, e.g. "Chennai" — empty when the company has none or several. */
  primaryBranch: string
  codePrefix: string
  isClient: boolean
}

/** Branding of the signed-in user's company; falls back to the product brand. */
export function useBranding(): Branding {
  const { tenant } = useAuth()
  const { data } = useData()
  const s = data?.settings
  const name = s?.name || tenant?.name
  const branches = s?.branches ?? []
  return {
    name: name || PRODUCT_NAME,
    logoUrl: s?.logoUrl || tenant?.logoUrl,
    primaryColor: s?.primaryColor || tenant?.primaryColor,
    tagline: s?.tagline ?? '',
    address: s?.address ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    primaryBranch: branches.length === 1 ? branches[0]! : '',
    codePrefix: s?.employeeCodePrefix || 'EMP',
    isClient: !!name,
  }
}
