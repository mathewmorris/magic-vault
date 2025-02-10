import React, { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { api } from '../../src/utils/api'

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: api.withTRPC(Wrapper), ...options })


export * from '@testing-library/react'
export { customRender as render }

