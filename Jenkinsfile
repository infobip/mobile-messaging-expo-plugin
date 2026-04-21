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

pipeline {
    agent { label 'ci-zg-mac-mini-02 || ci-zg-mac-mini-03' }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 2, unit: 'HOURS')
        skipDefaultCheckout(true)
    }

    parameters {
        gitParameter(
            name: 'BRANCH_NAME_TO_BUILD',
            type: 'PT_BRANCH',
            defaultValue: 'master',
            description: 'Branch to build and test',
            branchFilter: 'origin/(.*)',
            selectedValue: 'DEFAULT',
            sortMode: 'ASCENDING_SMART',
            useRepository: '.*infobip-mobile-messaging-expo-plugin.*'
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
        booleanParam(
            name: 'SKIP_EAS_BUILDS',
            defaultValue: false,
            description: 'Skip local EAS builds (faster feedback for plugin-only changes)'
        )
        booleanParam(
            name: 'PUBLISH',
            defaultValue: false,
            description: 'Publish to npm after successful build'
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
                        userRemoteConfigs: [[
                            url: 'ssh://git@git.ib-ci.com:7999/mml/infobip-mobile-messaging-expo-plugin.git',
                            credentialsId: 'bitbucket-credentials'
                        ]]
                    ])

                    env.GIT_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    env.DISPLAY_BRANCH = branchToCheckout
                    env.PLUGIN_VERSION = sh(script: "node -p \"require('./package.json').version\"", returnStdout: true).trim()

                    def timestamp = new Date().format('MMM d, yyyy, h:mm:ss a')
                    currentBuild.displayName = "#${env.BUILD_NUMBER} ${branchToCheckout} (${timestamp})"

                    notifyBitbucket(commitSha1: env.GIT_COMMIT)
                }
            }
        }

        stage('Install & Build') {
            steps {
                sh '''
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
                        sh '''
                            echo "=== TypeScript type check ==="
                            npx tsc --noEmit
                            echo "TypeScript check passed"
                        '''
                    }
                }
                stage('Lint') {
                    steps {
                        sh '''
                            echo "=== Linting ==="
                            npm run lint || true
                            echo "Lint completed"
                        '''
                    }
                }
                stage('Package Check') {
                    steps {
                        sh '''
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
                sh '''
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
                expression { return params.SKIP_EAS_BUILDS != true }
            }
            steps {
                sh '''
                    if ! command -v fastlane &> /dev/null; then
                        echo "Installing Fastlane..."
                        brew install fastlane || gem install fastlane --no-document
                    fi
                    fastlane --version
                '''
            }
        }

        stage('Local EAS Builds') {
            when {
                expression { return params.SKIP_EAS_BUILDS != true }
            }
            environment {
                EXPO_TOKEN = credentials('expo-token')
                ANDROID_HOME = "${HOME}/Library/Android/sdk"
            }
            parallel {
                stage('EAS Build iOS') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'ios' }
                    }
                    steps {
                        timeout(time: 30, unit: 'MINUTES') {
                            sh '''
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
                stage('EAS Build Android') {
                    when {
                        expression { return params.PLATFORM == 'both' || params.PLATFORM == 'android' }
                    }
                    steps {
                        timeout(time: 30, unit: 'MINUTES') {
                            sh '''
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

        stage('Publish to npm') {
            when {
                expression { return params.PUBLISH == true }
            }
            steps {
                script {
                    def tag = params.PUBLISH_TAG ?: 'latest'

                    echo """
╔════════════════════════════════════════════════╗
║             PUBLISHING TO NPM                  ║
╠════════════════════════════════════════════════╣
║  Package:  infobip-mobile-messaging-expo-plugin
║  Version:  ${env.PLUGIN_VERSION}
║  Tag:      ${tag}
╚════════════════════════════════════════════════╝
                    """

                    sh """
                        npm publish --tag ${tag}

                        echo "=== Verifying published package ==="
                        sleep 5
                        npm view infobip-mobile-messaging-expo-plugin@${env.PLUGIN_VERSION} version
                        echo "Published successfully"
                    """
                }
            }
        }
    }

    post {
        success {
            script {
                def prInfo = isPullRequest() ? " (PR #${getPullRequestId()})" : ""
                def branchName = env.DISPLAY_BRANCH ?: getBranchName()
                def duration = formatDuration(System.currentTimeMillis() - currentBuild.startTimeInMillis)
                def skippedEas = params.SKIP_EAS_BUILDS ? " | EAS builds skipped" : ""
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
