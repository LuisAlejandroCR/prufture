// PruftureZkModule.kt: exposes the Rust prover to JS as PruftureZk.prove / .verify on Android, the
// twin of ios/PruftureZkModule.swift. Runs off the main thread (AsyncFunction). Holds no identity:
// the secret arrives inside the circuit inputs and is never stored or logged here.

package expo.modules.prufturezk

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileNotFoundException
import uniffi.prufture_zk_prover.ProverException as RustProverException
import uniffi.prufture_zk_prover.proveSemaphore
import uniffi.prufture_zk_prover.verifySemaphore

class ZkeyMissingException :
  CodedException("semaphore-10.zkey is not bundled in this build")

class ProverException(detail: String) :
  CodedException("prover failed: $detail")

class PruftureZkModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PruftureZk")

    Constant("treeDepth") { 10 }

    AsyncFunction("prove") { inputsJson: String ->
      runProver { proveSemaphore(inputsJson, zkeyPath()) }
    }

    AsyncFunction("verify") { proofJson: String ->
      runProver { verifySemaphore(proofJson, zkeyPath()) }
    }
  }

  // UnsatisfiedLinkError covers a build whose jniLibs were not staged (no .so for this ABI).
  private inline fun <T> runProver(block: () -> T): T =
    try {
      block()
    } catch (e: RustProverException) {
      throw ProverException(e.message ?: e.toString())
    } catch (e: UnsatisfiedLinkError) {
      throw ProverException("native library missing: ${e.message}")
    }

  // The Rust prover opens the zkey by path, and APK assets have none: copy it to filesDir once per
  // installed app version, writing to a temp file and renaming so a killed copy never looks complete.
  private fun zkeyPath(): String = synchronized(ZKEY_LOCK) {
    val ctx = context
    val stamp = ctx.packageManager.getPackageInfo(ctx.packageName, 0).lastUpdateTime
    val dir = File(ctx.filesDir, "prufture-zk").apply { mkdirs() }
    val target = File(dir, "$ZKEY_BASENAME.$stamp.zkey")
    if (target.isFile && target.length() > 0) return target.absolutePath

    dir.listFiles()?.forEach { it.delete() }
    val tmp = File(dir, "$ZKEY_BASENAME.tmp")
    try {
      ctx.assets.open("$ZKEY_BASENAME.zkey").use { input ->
        tmp.outputStream().use { output -> input.copyTo(output) }
      }
    } catch (e: FileNotFoundException) {
      tmp.delete()
      throw ZkeyMissingException()
    }
    if (!tmp.renameTo(target)) {
      tmp.delete()
      throw ProverException("could not stage the zkey in filesDir")
    }
    target.absolutePath
  }

  companion object {
    private const val ZKEY_BASENAME = "semaphore-10"
    private val ZKEY_LOCK = Any()
  }
}
