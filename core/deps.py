import sys
import subprocess
import importlib
import os
from pathlib import Path
from typing import List, Dict, Tuple

if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
    os.system('chcp 65001 >nul 2>&1')


class DependencyManager:
    """依赖管理器"""

    CORE_DEPENDENCIES = {
        'jmcomic': 'jmcomic',
        'yaml': 'PyYAML',
        'fpdf': 'fpdf2', 
        'PIL': 'Pillow',
        'natsort': 'natsort'
    }
    
    OPTIONAL_DEPENDENCIES = {
        'requests': 'requests',
        'urllib3': 'urllib3'
    }
    
    def __init__(self):
        self.python_executable = sys.executable
    
    def check_dependencies(self) -> Dict[str, bool]:
        """检查依赖是否已安装"""
        results = {}
        
        for import_name, package_name in self.CORE_DEPENDENCIES.items():
            try:
                importlib.import_module(import_name)
                results[package_name] = True
                print(f"✅ {package_name} 已安装")
            except ImportError:
                results[package_name] = False
                print(f"❌ {package_name} 未安装")
        
        # 检查可选依赖
        for import_name, package_name in self.OPTIONAL_DEPENDENCIES.items():
            try:
                importlib.import_module(import_name)
                results[package_name] = True
                print(f"✅ {package_name} 已安装 (可选)")
            except ImportError:
                results[package_name] = False
                print(f"⚠️ {package_name} 未安装 (可选)")
        
        return results
    
    def get_missing_dependencies(self) -> List[str]:
        """获取缺失的核心依赖"""
        missing = []
        
        for import_name, package_name in self.CORE_DEPENDENCIES.items():
            try:
                importlib.import_module(import_name)
            except ImportError:
                missing.append(package_name)
        
        return missing
    
    def install_package(self, package_name: str) -> Tuple[bool, str]:
        """安装单个包"""
        try:
            print(f"正在安装 {package_name}...")
            
            cmd = [
                self.python_executable, 
                '-m', 'pip', 'install', 
                '--upgrade',
                package_name
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5分钟超时
            )
            
            if result.returncode == 0:
                print(f"✅ {package_name} 安装成功")
                return True, "安装成功"
            else:
                error_msg = result.stderr or result.stdout
                print(f"❌ {package_name} 安装失败: {error_msg}")
                return False, error_msg
                
        except subprocess.TimeoutExpired:
            error_msg = f"{package_name} 安装超时"
            print(f"❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"{package_name} 安装出错: {str(e)}"
            print(f"❌ {error_msg}")
            return False, error_msg
    
    def install_from_requirements(self, requirements_file: str = None) -> Tuple[bool, str]:
        """从requirements文件安装"""
        if not requirements_file:
            requirements_file = Path(__file__).parent / 'requirements.txt'
        
        if not Path(requirements_file).exists():
            return False, f"要求文件不存在: {requirements_file}"
        
        try:
            print(f"从 {requirements_file} 安装依赖...")
            
            cmd = [
                self.python_executable,
                '-m', 'pip', 'install',
                '-r', str(requirements_file),
                '--upgrade'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10分钟超时
            )
            
            if result.returncode == 0:
                print("✅ 所有依赖安装完成")
                return True, "安装完成"
            else:
                error_msg = result.stderr or result.stdout
                print(f"❌ 依赖安装失败:\n{error_msg}")
                return False, error_msg
                
        except subprocess.TimeoutExpired:
            error_msg = "依赖安装超时"
            print(f"❌ {error_msg}")
            return False, error_msg
        except Exception as e:
            error_msg = f"依赖安装出错: {str(e)}"
            print(f"❌ {error_msg}")
            return False, error_msg
    
    def install_missing_dependencies(self) -> Tuple[bool, str]:
        """安装缺失的核心依赖"""
        missing = self.get_missing_dependencies()
        
        if not missing:
            print("所有核心依赖都已安装")
            return True, "无需安装"
        
        print(f"发现 {len(missing)} 个缺失的依赖: {', '.join(missing)}")
        
        failed_packages = []
        
        for package in missing:
            success, error = self.install_package(package)
            if not success:
                failed_packages.append(f"{package}: {error}")
        
        if failed_packages:
            error_msg = f"以下包安装失败:\n" + "\n".join(failed_packages)
            return False, error_msg
        else:
            return True, "所有依赖安装完成"
    
    def verify_installation(self) -> Tuple[bool, List[str]]:
        """验证安装结果"""
        missing = self.get_missing_dependencies()
        
        if missing:
            print(f"❌ 仍有 {len(missing)} 个依赖未正确安装: {', '.join(missing)}")
            return False, missing
        else:
            print("✅ 所有核心依赖验证通过")
            return True, []
    
    def get_package_info(self, package_name: str) -> Dict[str, str]:
        """获取包信息"""
        try:
            result = subprocess.run(
                [self.python_executable, '-m', 'pip', 'show', package_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                info = {}
                for line in result.stdout.split('\n'):
                    if ':' in line:
                        key, value = line.split(':', 1)
                        info[key.strip()] = value.strip()
                return info
            else:
                return {}
                
        except Exception:
            return {}


def main():
    """主函数 - 用于命令行调用"""
    manager = DependencyManager()
    
    print("JMcomic Fetcher 依赖检查器")
    print("=" * 40)
    
    # 检查当前状态
    print("\n📋 检查依赖状态:")
    status = manager.check_dependencies()
    
    # 安装缺失的依赖
    missing = manager.get_missing_dependencies()
    if missing:
        print(f"\n🔧 开始安装 {len(missing)} 个缺失的依赖...")
        success, message = manager.install_missing_dependencies()
        
        if success:
            print(f"\n✅ {message}")
            # 重新验证
            print("\n🔍 验证安装结果:")
            verified, still_missing = manager.verify_installation()
            
            if not verified:
                print(f"❌ 安装未完全成功，仍缺少: {', '.join(still_missing)}")
                return 1
        else:
            print(f"\n❌ {message}")
            return 1
    else:
        print("\n✅ 所有核心依赖都已安装")
    
    print("\n🎉 依赖检查完成!")
    return 0


if __name__ == '__main__':
    sys.exit(main())
