import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { RegisterUserAPI } from '@/apis/user/RegisterUserAPI'
import { sendAPI } from '@/system/api/sendAPI'

import { AdminRegistrationDraft } from '../objects/AdminRegistrationDraft'
import type { AdminRegisterRequest } from '../objects/AdminRegisterRequest'

export interface AdminRegisterFormState {
  username: string
  password: string
  confirmPassword: string
  errorMessage: string
  isSubmitting: boolean
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  setConfirmPassword: (value: string) => void
  handleSubmit: () => Promise<void>
  goToLogin: () => void
}

export function useAdminRegisterForm(): AdminRegisterFormState {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const request: AdminRegisterRequest = {
      draft: AdminRegistrationDraft.fromForm(username, password, confirmPassword),
    }

    if (!request.draft.isComplete || !request.draft.confirmPassword) {
      setErrorMessage('请完整填写注册信息。')
      return
    }

    if (!request.draft.passwordsMatch) {
      setErrorMessage('两次输入的密码不一致。')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await sendAPI(new RegisterUserAPI(request.draft.username, request.draft.password, 'admin'))
      navigate('/library/login')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '注册失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    username,
    password,
    confirmPassword,
    errorMessage,
    isSubmitting,
    setUsername,
    setPassword,
    setConfirmPassword,
    handleSubmit,
    goToLogin: () => navigate('/library/login'),
  }
}
