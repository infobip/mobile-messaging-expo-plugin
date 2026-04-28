/*
 * Infobip Mobile Messaging Expo Plugin - CI/CD Pipeline
 *
 * Stages:
 * 1. Checkout
 * 2. Install & Build Plugin (TS compilation)
 * 3. Verify (typecheck, lint, npm pack)
 * 4. Prebuild Verification (iOS + Android)
 * 5. Local EAS Builds (iOS + Android, optional)
 * 6. npm Publish (manual trigger only)
 *
 * Triggers: push + PR (no nightly)
 * Agents: ci-zg-mac-mini-02 or ci-zg-mac-mini-03
 */

def formatDuration(long millis) {
    long totalSeconds = millis.intdiv(1000)
    long seconds = totalSeconds % 60
    long minutes = totalSeconds.intdiv(60) % 60
    long hours = totalSeconds.intdiv(3600)
    if (hours > 0) return "${hours}h ${minutes}m ${seconds}s"
    if (minutes > 0) return "${minutes}m ${seconds}s"
    return "${seconds}s"
}

def isPullRequest() {
    def prId = params.PR_ID?.trim() ?: ''
    def isValidPrId = prId != '' && !prId.contains('$') && prId.isNumber()
    return isValidPrId
}

def getPullRequestId() {
    return params.PR_ID ?: ''
}

def getBranchName() {
    return params.BRANCH_NAME_TO_BUILD ?: env.BRANCH_NAME ?: env.GIT_BRANCH?.replaceAll('origin/', '') ?: 'master'
}

def loadNvm() {
    return '''
        export NVM_DIR="$HOME/.nvm"
        if [ -s "$NVM_DIR/nvm.sh" ]; then
            set +x
            . "$NVM_DIR/nvm.sh" > /dev/null 2>&1
            set -x
        fi
    '''
}

def loadRbenv() {
    return '''
        if [ -d "$HOME/.rbenv" ]; then
            export PATH="$HOME/.rbenv/bin:$HOME/.rbenv/shims:$PATH"
            eval "$(rbenv init - 2>/dev/null)" || true
        fi
    '''
}

pipeline {
    agent { label 'ci-zg-mac-mini-02 || ci-zg-mac-mini-03' }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 2, unit: 'HOURS')
        skipDefaultCheckout(true)
    }

    parameters {
        string(
            name: 'BRANCH_NAME_TO_BUILD',
            defaultValue: 'master',
            description: 'Branch to build and test (e.g. master, feature/xyz)'
        )
        string(
            name: 'PR_ID',
            defaultValue: '',
            description: 'Pull Request ID (leave empty if not a PR build)'
        )
        choice(
            name: 'PLATFORM',
            choices: ['both', 'ios', 'android'],
            description: 'Platform to build: both, ios only, or android only'
        )
        choice(
            name: 'EAS_BUILD_MODE',
            choices: ['local', 'remote', 'skip'],
            description: 'EAS build mode: local (on this machine), remote (on EAS servers), skip (no builds)'
        )
        booleanParam(
            name: 'PUBLISH',
            defaultValue: false,
            description: 'Publish to npm after successful build'
        )
        string(
            name: 'RELEASE_VERSION',
            defaultValue: '',
            description: 'Version to release (e.g. 1.0.0). Required when PUBLISH is true.'
        )
        choice(
            name: 'PUBLISH_TAG',
            choices: ['latest', 'beta', 'rc'],
            description: 'npm dist-tag for publish (only used when PUBLISH is true)'
        )
    }

    environment {
        SLACK_CHANNEL = '#mobile-plugins-e2e-tests-build-results'
        LANG = 'en_US.UTF-8'
        LC_ALL = 'en_US.UTF-8'
        GITHUB_SSH_CREDENTIAL_ID = 'c47bc470-5484-42c4-b35d-a8cee5f4de1b'
        GITHUB_TOKEN_CREDENTIAL_ID = '0fcedef5-2786-4c06-a3af-d5759df202e4'
        BITBUCKET_CREDENTIAL_ID = '3019b761-a4ec-4af1-8dad-a825c70be1bd'
        NPM_TOKEN_CREDENTIAL_ID = '1ab2169b-efb6-45b2-8d54-d933d43a7c7e'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    def branchToCheckout = getBranchName()
                    echo "Checking out branch: ${branchToCheckout}"

                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: "*/${branchToCheckout}"]],
                        userRemoteConfigs: [
                            [
                                url: 'git@github.com:infobip/mobile-messaging-expo-plugin.git',
                                credentialsId: 'c47bc470-5484-42c4-b35d-a8cee5f4de1b'
                            ],
                            [
                                url: 'https://git.ib-ci.com/scm/mml/infobip-mobile-messaging-expo-plugin.git',
                                credentialsId: '3019b761-a4ec-4af1-8dad-a825c70be1bd'
                            ]
                        ]
                    ])

                    env.GIT_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    env.DISPLAY_BRANCH = branchToCheckout

                    env.EFFECTIVE_EAS_MODE = params.EAS_BUILD_MODE ?: 'local'
                    env.PLUGIN_VERSION = sh(script: "${loadNvm()} node -p \"require('./package.json').version\"", returnStdout: true).trim()

                    def timestamp = new Date().format('MMM d, yyyy, h:mm:ss a')
                    currentBuild.displayName = "#${env.BUILD_NUMBER} ${branchToCheckout} (${timestamp})"

                    notifyBitbucket(commitSha1: env.GIT_COMMIT)
                }
            }
        }

        stage('Copyright Header Check') {
            when {
                expression { return getBranchName() != 'master' }
            }
            environment {
                GIT_CREDENTIALS = credentials("${BITBUCKET_CREDENTIAL_ID}")
            }
            steps {
                script {
                    def branchName = getBranchName()

                    sh "${loadNvm()} " + """
                        echo "================================================"
                        echo "Running Copyright Header Check"
                        echo "================================================"

                        node scripts/add-copyright-header.js

                        if git diff --exit-code --quiet; then
                            echo "✅ All files have proper copyright headers"
                            exit 0
                        else
                            echo "⚠️  Files with missing copyright headers were detected and fixed"
                            echo ""
                            echo "Modified files:"
                            git diff --name-only

                            git config user.email "jenkins@infobip.com"
                            git config user.name "Jenkins CI"

                            git add -A
                            git commit -m "Add missing copyright headers

Automatically generated by Jenkins CI"

                            git config --local --unset-all credential.helper || true
                            git config --local credential.helper '!f() { test "\\\$1" = get && echo "username=\${GIT_CREDENTIALS_USR}" && echo "password=\${GIT_CREDENTIALS_PSW}"; }; f'
                            git push origin HEAD:${branchName}

                            echo ""
                            echo "✅ Changes committed and pushed to branch"
                            echo ""
                            echo "❌ BUILD FAILED: Copyright headers were missing"
                            echo "   A commit has been created with the fixes."
                            echo "   Please pull the latest changes."
                            exit 1
                        fi
                    """
                }
            }
        }

        stage('Install & Build') {
            steps {
                sh "${loadNvm()} " + '''
                    echo "=== Environment ==="
                    node --version
                    npm --version

                    echo "=== Installing dependencies ==="
                    npm install

                    echo "=== Building plugin ==="
                    npm run build

                    echo "=== Verifying build output ==="
                    test -f plugin/build/withInfobipMobileMessaging.js || (echo "FAIL: Main plugin JS not found" && exit 1)
                    test -f plugin/build/withInfobipMobileMessaging.d.ts || (echo "FAIL: Main plugin types not found" && exit 1)
                    test -d plugin/build/ios || (echo "FAIL: iOS build output missing" && exit 1)
                    test -d plugin/build/android || (echo "FAIL: Android build output missing" && exit 1)
                    test -f plugin/build/support/nseTemplates/NotificationService.swift || (echo "FAIL: NSE templates missing" && exit 1)

                    echo "Build output verified"
                    ls -la plugin/build/
                '''
            }
        }

        stage('Verify') {
            parallel {
                stage('TypeScript Check') {
                    steps {
                        sh "${loadNvm()} " + '''
                            echo "=== TypeScript type check ==="
                            npx tsc --noEmit
                            echo "TypeScript check passed"
                        '''
                    }
                }
                stage('Lint') {
                    steps {
                        sh "${loadNvm()} " + '''
                            echo "=== Linting ==="
                            npm run lint || true
                            echo "Lint completed"
                        '''
                    }
                }
                stage('Package Check') {
                    steps {
                        sh "${loadNvm()} " + '''
                            echo "=== npm pack dry run ==="
                            npm pack --dry-run 2>&1 | tee /tmp/pack-output.txt

                            echo "=== Verifying required files ==="
                            grep -q "app.plugin.js" /tmp/pack-output.txt || (echo "FAIL: app.plugin.js missing from package" && exit 1)
                            grep -q "expo-module.config.json" /tmp/pack-output.txt || (echo "FAIL: expo-module.config.json missing" && exit 1)
                            grep -q "withInfobipMobileMessaging.js" /tmp/pack-output.txt || (echo "FAIL: Main plugin JS missing from package" && exit 1)
                            grep -q "NotificationService.swift" /tmp/pack-output.txt || (echo "FAIL: NSE template missing from package" && exit 1)
                            grep -q "InfobipAppDelegate.swift" /tmp/pack-output.txt || (echo "FAIL: AppDelegate subscriber missing from package" && exit 1)
                            grep -q "podspec" /tmp/pack-output.txt || (echo "FAIL: podspec missing from package" && exit 1)

                            echo "Package contents verified"
                        '''
                    }
                }
            }
        }

        stage('Prebuild Verification') {
            steps {
                sh "${loadNvm()} " + '''
                    echo "=== Running expo prebuild --clean ==="
                    cd example
                    npx expo prebuild --clean

                    echo "=== Verifying iOS output ==="
                    grep -q "aps-environment" ios/InfobipExpoExample/InfobipExpoExample.entitlements || (echo "FAIL: aps-environment missing from entitlements" && exit 1)
                    grep -q "com.apple.security.application-groups" ios/InfobipExpoExample/InfobipExpoExample.entitlements || (echo "FAIL: App Groups missing from entitlements" && exit 1)

                    test -f ios/InfobipNotificationServiceExtension/NotificationService.swift || (echo "FAIL: NSE Swift file missing" && exit 1)
                    test -f ios/InfobipNotificationServiceExtension/InfobipNotificationServiceExtension-Info.plist || (echo "FAIL: NSE plist missing" && exit 1)
                    test -f ios/InfobipNotificationServiceExtension/InfobipNotificationServiceExtension.entitlements || (echo "FAIL: NSE entitlements missing" && exit 1)

                    grep -q "InfobipNotificationServiceExtension" ios/InfobipExpoExample.xcodeproj/project.pbxproj || (echo "FAIL: NSE target not in Xcode project" && exit 1)
                    grep -q "MobileMessagingNotificationExtension" ios/Podfile || (echo "FAIL: NSE pod not in Podfile" && exit 1)
                    grep -q "remote-notification" ios/InfobipExpoExample/Info.plist || (echo "FAIL: remote-notification not in Info.plist" && exit 1)
                    grep -q "com.mobilemessaging.app_group" ios/InfobipExpoExample/Info.plist || (echo "FAIL: app_group key not in Info.plist" && exit 1)
                    grep -q "com.infobip.mobilemessaging" ios/InfobipExpoExample/Info.plist || (echo "FAIL: Deep link scheme not in Info.plist" && exit 1)

                    echo "iOS prebuild verified"

                    echo "=== Verifying Android output ==="
                    test -f android/app/google-services.json || (echo "FAIL: google-services.json not copied" && exit 1)
                    grep -q "com.google.gms.google-services" android/app/build.gradle || (echo "FAIL: Google Services plugin not applied" && exit 1)
                    grep -q "tools:replace" android/app/src/main/AndroidManifest.xml || (echo "FAIL: tools:replace not in manifest" && exit 1)
                    grep -q "com.infobip.mobilemessaging" android/app/src/main/AndroidManifest.xml || (echo "FAIL: Deep link scheme not in manifest" && exit 1)
                    grep -q "singleTask" android/app/src/main/AndroidManifest.xml || (echo "FAIL: singleTask not set on MainActivity" && exit 1)

                    echo "Android prebuild verified"
                '''
            }
        }

        stage('EAS Build Prerequisites') {
            when {
                expression { return env.EFFECTIVE_EAS_MODE == 'local' }
            }
            steps {
                sh "${loadRbenv()} " + '''
                    fastlane --version
                '''
            }
        }

        stage('Local EAS Builds') {
            when {
                expression { return env.EFFECTIVE_EAS_MODE == 'local' }
            }
            environment {
                EXPO_TOKEN = credentials('expo-token')
                ANDROID_HOME = "${HOME}/Library/Android/sdk"
            }
            parallel {
                stage('EAS Build iOS (local)') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'ios' }
                    }
                    steps {
                        timeout(time: 30, unit: 'MINUTES') {
                            sh "${loadNvm()} ${loadRbenv()} " + '''
                                cd example
                                echo "=== Local EAS iOS Build ==="
                                npx eas-cli build --platform ios --profile preview --local --non-interactive 2>&1 | tee /tmp/eas-ios-build.log

                                IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)
                                if [ -n "$IPA" ]; then
                                    echo "iOS build artifact: $IPA"
                                else
                                    echo "WARNING: No IPA file found"
                                fi
                            '''
                        }
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'example/build-*.ipa', allowEmptyArchive: true
                        }
                    }
                }
                stage('EAS Build Android (local)') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'android' }
                    }
                    steps {
                        timeout(time: 30, unit: 'MINUTES') {
                            sh "${loadNvm()} " + '''
                                cd example
                                echo "=== Local EAS Android Build ==="
                                npx eas-cli build --platform android --profile preview --local --non-interactive 2>&1 | tee /tmp/eas-android-build.log

                                APK=$(ls -t build-*.apk 2>/dev/null | head -1)
                                if [ -n "$APK" ]; then
                                    echo "Android build artifact: $APK"
                                else
                                    echo "WARNING: No APK file found"
                                fi
                            '''
                        }
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'example/build-*.apk', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('Remote EAS Builds') {
            when {
                expression { return env.EFFECTIVE_EAS_MODE == 'remote' }
            }
            environment {
                EXPO_TOKEN = credentials('expo-token')
            }
            parallel {
                stage('EAS Build iOS (remote)') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'ios' }
                    }
                    steps {
                        timeout(time: 90, unit: 'MINUTES') {
                            sh "${loadNvm()} " + '''
                                cd example
                                echo "=== Remote EAS iOS Build ==="
                                npx eas-cli build --platform ios --profile preview --non-interactive
                            '''
                        }
                    }
                }
                stage('EAS Build Android (remote)') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'android' }
                    }
                    steps {
                        timeout(time: 90, unit: 'MINUTES') {
                            sh "${loadNvm()} " + '''
                                cd example
                                echo "=== Remote EAS Android Build ==="
                                npx eas-cli build --platform android --profile preview --non-interactive
                            '''
                        }
                    }
                }
            }
        }

        stage('Publish to npm') {
            when {
                expression { return params.PUBLISH == true }
            }
            environment {
                NPM_TOKEN = credentials("${NPM_TOKEN_CREDENTIAL_ID}")
                GIT_CREDENTIALS = credentials("${BITBUCKET_CREDENTIAL_ID}")
            }
            steps {
                script {
                    def tag = params.PUBLISH_TAG ?: 'latest'
                    def releaseVersion = params.RELEASE_VERSION?.trim()

                    if (!releaseVersion) {
                        error "RELEASE_VERSION is required when PUBLISH is true"
                    }

                    echo """
╔════════════════════════════════════════════════╗
║             PUBLISHING TO NPM                  ║
╠════════════════════════════════════════════════╣
║  Package:  infobip-mobile-messaging-expo-plugin
║  Version:  ${releaseVersion}
║  Tag:      ${tag}
╚════════════════════════════════════════════════╝
                    """

                    sh "${loadNvm()} " + """
                        git config user.email "jenkins@infobip.com"
                        git config user.name "Jenkins CI"

                        echo "=== Setting release version ==="
                        npm --no-git-tag-version --force version ${releaseVersion}
                        git add package.json

                        echo "=== Committing release ==="
                        git commit -a -m "Release: ${releaseVersion}"

                        echo "=== Tagging release ==="
                        git tag ${releaseVersion} -m "Release: ${releaseVersion}"

                        echo "=== Publishing to npm ==="
                        echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > .npmrc
                        npm publish --access public --tag ${tag}

                        echo "=== Verifying published package ==="
                        sleep 5
                        npm view infobip-mobile-messaging-expo-plugin@${releaseVersion} version
                        echo "Published successfully"

                        echo "=== Pushing to Bitbucket ==="
                        git remote set-url origin https://\${GIT_CREDENTIALS_USR}:\${GIT_CREDENTIALS_PSW}@git.ib-ci.com/scm/mml/infobip-mobile-messaging-expo-plugin.git
                        git push origin HEAD:master --tags
                        echo "Bitbucket pushed"
                    """

                    sshagent([env.GITHUB_SSH_CREDENTIAL_ID]) {
                        sh '''
                            echo "=== Pushing to GitHub ==="
                            git push git@github.com:infobip/mobile-messaging-expo-plugin.git HEAD:main --tags
                            echo "GitHub pushed"
                        '''
                    }

                    withCredentials([string(credentialsId: env.GITHUB_TOKEN_CREDENTIAL_ID, variable: 'GITHUB_TOKEN')]) {
                        sh """
                            echo "=== Creating GitHub Release ==="
                            curl -s -X POST \
                                -H "Authorization: token \${GITHUB_TOKEN}" \
                                -H "Accept: application/vnd.github+json" \
                                https://api.github.com/repos/infobip/mobile-messaging-expo-plugin/releases \
                                -d '{"tag_name":"${releaseVersion}","name":"${releaseVersion}","body":"Release ${releaseVersion}","draft":false,"prerelease":false}'
                            echo "GitHub Release created"
                        """
                    }
                }
            }
        }

        stage('Sync to GitHub') {
            when {
                expression { return getBranchName() == 'master' }
            }
            steps {
                sshagent([env.GITHUB_SSH_CREDENTIAL_ID]) {
                    sh '''
                        echo "=== Syncing master to GitHub main ==="
                        git push git@github.com:infobip/mobile-messaging-expo-plugin.git HEAD:main --tags
                        echo "GitHub synced"
                    '''
                }
            }
        }
    }

    post {
        success {
            script {
                def prInfo = isPullRequest() ? " (PR #${getPullRequestId()})" : ""
                def duration = formatDuration(System.currentTimeMillis() - currentBuild.startTimeInMillis)
                def skippedEas = env.EFFECTIVE_EAS_MODE == 'skip' ? " | EAS builds skipped" : " | EAS: ${env.EFFECTIVE_EAS_MODE}"
                def published = params.PUBLISH ? " | :package: Published v${env.PLUGIN_VERSION} (${params.PUBLISH_TAG})" : ""

                slackSend(
                    channel: env.SLACK_CHANNEL,
                    color: 'good',
                    message: ":white_check_mark: *Expo Plugin* #${env.BUILD_NUMBER} passed${prInfo}\n" +
                             "> Branch: `${branchName}` | v${env.PLUGIN_VERSION}\n" +
                             "> Duration: ${duration}${skippedEas}${published}\n" +
                             "> <${env.BUILD_URL}|View Build>"
                )

                notifyBitbucket(commitSha1: env.GIT_COMMIT)
            }
        }

        failure {
            script {
                def prInfo = isPullRequest() ? " (PR #${getPullRequestId()})" : ""
                def branchName = env.DISPLAY_BRANCH ?: getBranchName()
                def duration = formatDuration(System.currentTimeMillis() - currentBuild.startTimeInMillis)

                slackSend(
                    channel: env.SLACK_CHANNEL,
                    color: 'danger',
                    message: ":x: *Expo Plugin* #${env.BUILD_NUMBER} failed${prInfo}\n" +
                             "> Branch: `${branchName}`\n" +
                             "> Duration: ${duration}\n" +
                             "> <${env.BUILD_URL}|View Build>"
                )

                notifyBitbucket(commitSha1: env.GIT_COMMIT)
            }
        }

        aborted {
            script {
                def prInfo = isPullRequest() ? " (PR #${getPullRequestId()})" : ""
                def branchName = env.DISPLAY_BRANCH ?: getBranchName()

                slackSend(
                    channel: env.SLACK_CHANNEL,
                    color: '#808080',
                    message: ":no_entry_sign: *Expo Plugin* #${env.BUILD_NUMBER} aborted${prInfo}\n" +
                             "> Branch: `${branchName}`\n" +
                             "> <${env.BUILD_URL}|View Build>"
                )

                notifyBitbucket(commitSha1: env.GIT_COMMIT)
            }
        }

        always {
            cleanWs()
        }
    }
}
