import { Outlet } from 'react-router'
import { Button } from '@heroui/react'

export default function Layout() {
  return (
    <div className='min-h-screen bg-gray-50'>
      <header className='border-b bg-white px-6 py-3 flex items-center justify-between'>
        <span className='font-bold text-xl text-gray-900 cursor-pointer'>
          Product Manager
        </span>
        <div className='flex items-center gap-4'>
          <span className='text-sm text-gray-500'>
            Hello, <span className='font-medium text-gray-800'>admin</span>
          </span>
          <Button variant='danger-soft' size='sm'>
            Logout
          </Button>
        </div>
      </header>
      <main className='max-w-7xl mx-auto px-4 py-8'>
        <Outlet />
      </main>
    </div>
  )
}
