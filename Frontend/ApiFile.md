#  Filename:categorizrmail.yaml
 
swagger: '2.0'
info:
  title: CategorizrMail Api
  description: For mobile app and web app usage
  version: 1.0.0
host: dev.weisetechdev.com
schemes:
  - http
basePath: /categorizrmail/api
consumes:
  - application/json
produces:
  - application/json
paths:
  /user/login:
    post:
      summary: Login user
      description: This end point is used to login user. 
      parameters:
        - name: userName
          in: query
          description: email address or user name
          required: true
          type: string
        - name: password
          in: query
          description: md5 encoded password
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: will return LoginResponse
          schema:
            $ref: '#/definitions/LoginResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'   
  /user/signup:
    post:
      summary: Signup User
      description: This end point is used to login user.
      parameters:
        - name: createUserRequest
          in: body
          description: createUserRequest
          required: true
          schema:
            $ref: '#/definitions/CreateUserRequest'
      tags:
        - user
      responses:
        '200':
          description: will return LoginResponse
          schema:
            $ref: '#/definitions/LoginResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'            
  /user/updatedevicetoken:
    post:
      summary: Update Device Token
      description: will return list of user
      parameters:
        - name: deviceId
          in: query
          description: device id.
          required: true
          type: integer
        - name: deviceType
          in: query
          required: true
          type: integer
          enum:
            - 0
            - 1
          description: 0 is equal to Android device and 1 is equal to iPhone device.
        - name: deviceToken
          in: query
          description: device token.
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/updateuser:
    post:
      summary: Update User Profile
      description: This end point is used to update user profile.
      parameters:
        - name: createUserRequest
          in: body
          description: createUserRequest
          required: true
          schema:
            $ref: '#/definitions/CreateUserRequest'
      tags:
        - user
      responses:
        '200':
          description: will return Updated user response
          schema:
            $ref: '#/definitions/User'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getuserdetails:
    get:
      summary: Get User Profile
      description: This end point is used to get user profile.
      tags:
        - user
      responses:
        '200':
          description: will return user response
          schema:
            $ref: '#/definitions/User'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/searchuser:
    get:
      summary: Search User Profile
      description: This end point is used to search user profile.
      parameters:
        - name: searchterm
          in: query
          description: search term
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: will return user response
          schema:
            type: array
            items:
              $ref: '#/definitions/User'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/forwardreceipt:
    post:
      summary: Forword receipt
      description: This end point is used to forword receipt.
      parameters:
        - name: UserReceipt
          in: body
          description: UserReceipt
          required: true
          schema:
            $ref: '#/definitions/UserReceipt'
      tags:
        - user
      responses:
        '200':
          description: will return original username
          schema:
            $ref: '#/definitions/OriginalUser'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/forwardreceiptv2:
    post:
      summary: Forword receipt
      description: This end point is used to forword receipt.
      parameters:
        - name: UserReceipt
          in: body
          description: UserReceipt
          required: true
          schema:
            $ref: '#/definitions/UserReceipt'
      tags:
        - user
      responses:
        '200':
          description: will return original username
          schema:
            $ref: '#/definitions/OriginalUser'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getuserreceipt:
    get:
      summary: Get User Receipt
      description: This end point is used to get user receipt.
      parameters:
        - name: fk_user_id
          in: query
          description: user id
          required: true
          type: integer
      tags:
        - user
      responses:
        '200':
          description: response ok
          schema:
            $ref: '#/definitions/UserReceiptResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getreceipthistory:
    get:
      summary: Get User Receipt history
      description: This end point is used to get user receipt history.
      parameters:
        - name: fk_receipt_id
          in: query
          description: receipt id
          required: true
          type: integer
      tags:
        - user
      responses:
        '200':
          description: response ok
          schema:
              $ref: '#/definitions/UserReceiptResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getreceiptfromdate:
    get:
      summary: Get User Receipt From Date
      description: This end point is used to get user receipt from date.
      parameters:
        - name: fk_user_id
          in: query
          description: user id
          required: true
          type: integer
        - name: date_time_stamp
          in: query
          description: date timestamp
          required: false
          type: integer
      tags:
        - user
      responses:
        '200':
          description: response ok
          schema:
            $ref: '#/definitions/UserReceiptResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getreceiptfromdatev1:
    get:
      summary: Get User Receipt From Date (With TAX)
      description: This end point is used to get user receipt from date.
      parameters:
        - name: fk_user_id
          in: query
          description: user id
          required: true
          type: integer
        - name: date_time_stamp
          in: query
          description: date timestamp
          required: false
          type: integer
      tags:
        - user
      responses:
        '200':
          description: response ok
          schema:
            type: array
            items:
              $ref: '#/definitions/UserReceiptv1'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/getunreaduserreceipt:
    get:
      summary: Get User Receipt
      description: This end point is used to get user receipt.
      tags:
        - user
      responses:
        '200':
          description: response ok
          schema:
            $ref: '#/definitions/UserReceiptResponse'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/uploadmedia:
    post:
      summary: Upload Media
      description: user can upload multiple media with this api
      consumes:
        - multipart/form-data
      parameters:
        - name: filemedia
          in: formData
          description: upload multiple media file uploader name
          required: true
          type: file
      tags:
        - uploadmedia
      responses:
        '200':
          description: will return full image url and thumb url
          schema:
            type: array
            items:
              $ref: '#/definitions/uploadmedia'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/uploadmediaV1:
    post:
      summary: Upload Media to google cloud
      description: user can upload multiple media with this api
      consumes:
        - multipart/form-data
      parameters:
        - name: file
          in: formData
          description: upload multiple media file uploader name
          required: true
          type: file
      tags:
        - uploadmedia
      responses:
        '200':
          description: will return full image url and thumb url
          schema:
            type: array
            items:
              $ref: '#/definitions/uploadmedia'
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/forgotusername:
    get:
      summary: Forgot Username
      description: This end point is used to forgot username.
      parameters:
        - name: recoveryEmail
          in: query
          description: recovery email id
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/forgotpassword:
    get:
      summary: Forgot Password
      description: This end point is used to forgot password.
      parameters:
        - name: recoveryEmail
          in: query
          description: recovery email id
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/resetpassword:
    get:
      summary: Reset Password
      description: This end point is used to reset password.
      parameters:
        - name: recoveryEmail
          in: query
          description: recovery email id
          required: true
          type: string
        - name: password
          in: query
          description: password
          required: true
          type: string
        - name: confirmPassword
          in: query
          description: confirm password
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/deleteuser:
    post:
      summary: Delete User
      description: user delete with this api
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/sendmailotptoverify:
    post:
      summary: Send OTP to recovery email id
      description: This end point is used to send OTP to recovery email id for email verification.
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/verifymailotpforemail:
    post:
      summary: Verify send OTP to recovery email id
      description: This end point is used to verify send OTP to recovery email id for email verification.
      parameters:
        - name: code
          in: query
          description: code from recovery email id
          required: true
          type: string
      tags:
        - user
      responses:
        '200':
          description: response ok
        default:
          description: Unexpected error
          schema:
            $ref: '#/definitions/Error'
  /user/verifymailotpforemailv1:
    post:
      summary: Verify send OTP to ...
Collapse
 This snippet was truncated for display; see it in full



