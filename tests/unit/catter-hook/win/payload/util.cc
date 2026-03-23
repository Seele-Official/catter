
#include "win/payload/util.h"

#include <eventide/zest/zest.h>

#include <filesystem>
#include <fstream>
#include <string>

#include <windows.h>

namespace ct = catter;
namespace fs = std::filesystem;

namespace {

struct TempSandbox {
	fs::path root;

	TempSandbox() {
		root = fs::temp_directory_path() /
		       (L"catter_win_payload_ut_" + std::to_wstring(GetCurrentProcessId()) + L"_"
		        + std::to_wstring(GetTickCount64()));
		fs::create_directories(root);
	}

	~TempSandbox() {
		std::error_code ec;
		fs::remove_all(root, ec);
	}
};

void touch_file(const fs::path& file) {
	fs::create_directories(file.parent_path());
	std::ofstream out(file, std::ios::binary);
	out << "test";
}

bool same_existing_file(const fs::path& left, const fs::path& right) {
	std::error_code ec;
	if(fs::equivalent(left, right, ec)) {
		return true;
	}
	return false;
}

struct ScopedCurrentDirectory {
	std::wstring original;

	ScopedCurrentDirectory(const fs::path& path) {
		wchar_t buffer[MAX_PATH];
		auto len = GetCurrentDirectoryW(MAX_PATH, buffer);
		if(len > 0) {
			original.assign(buffer, len);
		}
		SetCurrentDirectoryW(path.wstring().c_str());
	}

	~ScopedCurrentDirectory() {
		if(!original.empty()) {
			SetCurrentDirectoryW(original.c_str());
		}
	}
};

struct ScopedEnvVar {
	std::wstring name;
	std::wstring original;
	bool had_original = false;

	ScopedEnvVar(std::wstring name_value, const std::wstring& value) : name(std::move(name_value)) {
		wchar_t buffer[32768];
		auto len = GetEnvironmentVariableW(name.c_str(), buffer, 32768);
		if(len > 0 && len < 32768) {
			had_original = true;
			original.assign(buffer, len);
		}
		SetEnvironmentVariableW(name.c_str(), value.c_str());
	}

	~ScopedEnvVar() {
		if(had_original) {
			SetEnvironmentVariableW(name.c_str(), original.c_str());
		} else {
			SetEnvironmentVariableW(name.c_str(), nullptr);
		}
	}
};

TEST_SUITE(win_payload_util) {
	TEST_CASE(resolve_abspath_from_application_name_appends_exe_and_searches_current_directory) {
		TempSandbox sandbox;
		ScopedCurrentDirectory scope(sandbox.root);

		auto app_path = sandbox.root / "clang.exe";
		touch_file(app_path);

		auto resolved = ct::win::payload::resolve_abspath("clang", "clang -c main.cc");
		EXPECT_TRUE(same_existing_file(fs::path(resolved), app_path));
	};

	TEST_CASE(resolve_abspath_from_application_name_with_path_does_not_append_exe) {
		TempSandbox sandbox;
		ScopedCurrentDirectory scope(sandbox.root);

		auto app_path = sandbox.root / "bin" / "lld";
		touch_file(app_path);

		auto resolved = ct::win::payload::resolve_abspath("bin\\lld", "bin\\lld /v");
		EXPECT_TRUE(same_existing_file(fs::path(resolved), app_path));
		EXPECT_TRUE(fs::path(resolved).filename() == "lld");
	};

	TEST_CASE(resolve_abspath_from_command_line_searches_path_variable) {
		TempSandbox sandbox;
		auto cwd = sandbox.root / "cwd";
		fs::create_directories(cwd);
		ScopedCurrentDirectory scope(cwd);

		auto app_dir = sandbox.root / "pathbin";
		auto app_path = app_dir / "runner.exe";
		touch_file(app_path);

		ScopedEnvVar path_scope(L"PATH", app_dir.wstring());

		auto resolved = ct::win::payload::resolve_abspath(nullptr, "runner --version");
		EXPECT_TRUE(same_existing_file(fs::path(resolved), app_path));
	};

	TEST_CASE(resolve_abspath_from_command_line_supports_quoted_token) {
		TempSandbox sandbox;
		ScopedCurrentDirectory scope(sandbox.root);

		auto app_path = sandbox.root / "quoted.exe";
		touch_file(app_path);

		auto resolved = ct::win::payload::resolve_abspath(nullptr, "\"quoted\" --help");
		EXPECT_TRUE(same_existing_file(fs::path(resolved), app_path));
	};

	TEST_CASE(get_proxy_path_reads_environment_variable) {
		ScopedEnvVar scope(L"CATTER_PROXY_PATH", L"C:\\tmp\\proxy.exe");
		EXPECT_TRUE(ct::win::payload::get_proxy_path() == "C:\\tmp\\proxy.exe");
		EXPECT_TRUE(ct::win::payload::get_proxy_path_wide() == L"C:\\tmp\\proxy.exe");
	};

	TEST_CASE(get_ipc_id_reads_environment_variable) {
		ScopedEnvVar scope(L"CATTER_IPC_ID", L"12345");
		EXPECT_TRUE(ct::win::payload::get_ipc_id() == "12345");
		EXPECT_TRUE(ct::win::payload::get_ipc_id_wide() == L"12345");
	};

};

}  // namespace
