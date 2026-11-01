import { useNavigate } from 'react-router-dom'

import { LogoutUserAPI } from '@/apis/user/LogoutUserAPI'
import { clearAuthToken } from '@/system/api/authToken'
import { sendAPI } from '@/system/api/sendAPI'

import type { DashboardAction } from '../objects/DashboardAction'

export function useAdminDashboard() {
  const navigate = useNavigate()

  const openAction = (action: DashboardAction) => {
    navigate(action.targetPath)
  }

  const logout = async () => {
    try {
      await sendAPI(new LogoutUserAPI())
      navigate('/library/login')
    } catch {
      navigate('/library/login')
    } finally {
      clearAuthToken()
    }
  }

  return {
    openAction,
    logout,
  }
}
