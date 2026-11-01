import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LoginUserAPI } from '@/apis/user/LoginUserAPI'
import { clearAuthToken, saveAuthToken } from '@/system/api/authToken'
import { sendAPI } from '@/system/api/sendAPI'

import { AdminCredentials } from '../objects/AdminCredentials'
import type { AdminLoginRequest } from '../objects/AdminLoginRequest'

export interface AdminLoginFormState {
  username: string
  password: string
  errorMessage: string
  isSubmitting: boolean
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  handleSubmit: () => Promise<void>
  goToRegister: () => void
}

export function useAdminLoginForm(): AdminLoginFormState {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const request: AdminLoginRequest = {
      credentials: AdminCredentials.fromForm(username, password),
    }

    if (!request.credentials.isComplete) {
      setErrorMessage('请输入用户名和密码。')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const response = await sendAPI(new LoginUserAPI(request.credentials.username, request.credentials.password))
      if (response.user?.role !== 'admin') {
        clearAuthToken()
        setErrorMessage('当前账号不是管理员账号。')
        return
      }

      if (response.token) {
        saveAuthToken(response.token)
      }

      navigate('/library/admin/dashboard')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    username,
    password,
    errorMessage,
    isSubmitting,
    setUsername,
    setPassword,
    handleSubmit,
    goToRegister: () => navigate('/library/register'),
  }
}
