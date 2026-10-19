import { useEffect } from 'react'
import { useBranding } from '@/hooks/useBranding'
import { applyBrandColor, PRODUCT_NAME } from '@/lib/brand'

/** Keeps the brand colour and browser tab title in step with the signed-in company. */
export function BrandingEffect() {
  const { name, primaryColor, isClient } = useBranding()

  useEffect(() => applyBrandColor(primaryColor), [primaryColor])
  useEffect(() => {
    document.title = isClient ? `${name} · Attendance` : PRODUCT_NAME
  }, [name, isClient])

  return null
}
